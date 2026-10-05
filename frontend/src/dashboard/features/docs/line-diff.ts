// Line edits and word diff of a proposed correction. Pure functions, shared by the dashboard and the Node tests.

/* ---------- Line edits and word diff ---------- */

export type LineEdit = { op: "replace" | "insert_after" | "delete"; start: number; end: number; text: string };

/** Applies line edits to a text, bottom-up; inserts at the same place keep their order. Same rules as the server. */
export function applyLineEdits(before: string, edits: LineEdit[]): string {
  const lines = before.split("\n");
  const sorted = edits
    .map((e, index) => ({ ...e, index, end: e.op === "insert_after" ? e.start : e.end }))
    .sort((a, b) => b.start - a.start || Number(a.op === "insert_after") - Number(b.op === "insert_after") || b.index - a.index);
  for (const e of sorted) {
    const text = e.text.replace(/\n$/, "").split("\n");
    if (e.op === "insert_after") lines.splice(e.start, 0, ...text);
    else lines.splice(e.start - 1, e.end - e.start + 1, ...(e.op === "delete" ? [] : text));
  }
  return lines.join("\n");
}

/** The line edits that turn one text into another (line diff by longest common subsequence). */
export function editsBetween(before: string, after: string): LineEdit[] {
  const a = before.split("\n"), b = after.split("\n"), n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const edits: LineEdit[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; continue; }
    const from = i, added: string[] = [];
    while ((i < n || j < m) && !(i < n && j < m && a[i] === b[j])) {
      if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) added.push(b[j++]);
      else i++;
    }
    if (i > from) edits.push(added.length ? { op: "replace", start: from + 1, end: i, text: added.join("\n") } : { op: "delete", start: from + 1, end: i, text: "" });
    else edits.push({ op: "insert_after", start: from, end: from, text: added.join("\n") });
  }
  return edits;
}

export type Seg = { kind: "same" | "del" | "add"; text: string };

// Code spans and links are compared as one piece, so a marked change never cuts through them.
const TOKEN = /`[^`\n]*`|!?\[[^\]\n]*\]\([^)\n]*\)|[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu;
const norm = (t: string) => (/^\s+$/.test(t) ? " " : t);

/** Word diff of two lines; whitespace differences count as unchanged. */
export function wordDiff(before: string, after: string): Seg[] {
  const a = before.match(TOKEN) ?? [], b = after.match(TOKEN) ?? [];
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = norm(a[i]) === norm(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: Seg[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) { ops.push({ kind: "same", text: b[j] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ kind: "del", text: a[i++] });
    else ops.push({ kind: "add", text: b[j++] });
  }
  while (i < n) ops.push({ kind: "del", text: a[i++] });
  while (j < m) ops.push({ kind: "add", text: b[j++] });
  // Whitespace on its own is never a change: inside a removed or added run it belongs to the run (so the words keep
  // their spaces), at its edge a removed space disappears and an added one counts as unchanged.
  const word = (k: number, step: 1 | -1) => { for (let x = k + step; x >= 0 && x < ops.length; x += step) if (ops[x].text.trim()) return ops[x].kind; return null; };
  const out: Seg[] = [];
  ops.forEach((op, k) => {
    let kind = op.kind;
    // A removed space next to a removed word goes with it (the struck word keeps its gap); an added space counts as
    // added only between added words.
    if (kind === "del" && !op.text.trim() && word(k, -1) !== "del" && word(k, 1) !== "del") return;
    if (kind === "add" && !op.text.trim() && !(word(k, -1) === "add" && word(k, 1) === "add")) kind = "same";
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += op.text;
    else out.push({ kind, text: op.text });
  });
  return absorbShortEqualities(out);
}

/**
 * A tiny unchanged piece between two changes ("3", ".", "er") splits one change into many marks. It becomes part of
 * both the removed and the added text, so the change reads as one: [del A][add B][same .][del C][add D] → [del A.C][add B.D].
 */
function absorbShortEqualities(segs: Seg[]): Seg[] {
  const changed = (s?: Seg) => !!s && s.kind !== "same";
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.kind === "same" && s.text.trim().length <= 2 && changed(segs[i - 1]) && changed(segs[i + 1])) {
      // Collect the change run before (already in out) and after, then join them around this piece.
      const before: Seg[] = [];
      while (changed(out.at(-1))) before.unshift(out.pop()!);
      let j = i + 1;
      const after: Seg[] = [];
      while (changed(segs[j])) after.push(segs[j++]);
      const text = (kind: "del" | "add", run: Seg[]) => run.filter((x) => x.kind === kind).map((x) => x.text).join("");
      const del = text("del", before) + s.text + text("del", after), add = text("add", before) + s.text + text("add", after);
      out.push({ kind: "del", text: del }, { kind: "add", text: add });
      i = j - 1;
      continue;
    }
    out.push({ ...s });
  }
  // Merging can make neighbouring runs of the same kind.
  return out.reduce<Seg[]>((acc, s) => { const last = acc.at(-1); if (last && last.kind === s.kind) last.text += s.text; else acc.push(s); return acc; }, []);
}

/** How much two lines share (0 … 1), to decide whether a changed line is shown as one line with marked words. */
export function similarity(a: string, b: string) {
  const segs = wordDiff(a, b), same = segs.filter((s) => s.kind === "same").reduce((n, s) => n + s.text.trim().length, 0);
  return same / Math.max(1, Math.max(a.trim().length, b.trim().length));
}

/* ---------- Rows: the section line by line, with what happens to each line ---------- */

export type Row = {
  text: string;
  /** del: line goes, add: line comes, mod: line stays with marked words. */
  mark?: "del" | "add" | "mod";
  segments?: Seg[];
  /** Number of the change (1-based) this row belongs to; the first row of a change carries its marker. */
  change?: number;
  first?: boolean;
};

/**
 * Rows of a section with a set of numbered changes: every edit becomes rows next to the unchanged lines.
 * A replaced line that stays recognizable is one row with marked words instead of an old and a new row.
 */
export function changeRows(before: string, changes: { edits: LineEdit[] }[]): Row[] {
  const lines = before.split("\n");
  const at = new Map<number, { kind: "replace" | "delete"; edit: LineEdit; change: number }>();
  const inserts = new Map<number, { edit: LineEdit; change: number }[]>();
  changes.forEach((c, k) => {
    for (const e of c.edits) {
      if (e.op === "insert_after") inserts.set(e.start, [...(inserts.get(e.start) ?? []), { edit: e, change: k + 1 }]);
      else at.set(e.start, { kind: e.op, edit: e, change: k + 1 });
    }
  });
  const rows: Row[] = [];
  const added = (text: string, change: number) => text.replace(/\n$/, "").split("\n").map((t, i) => ({ text: t, mark: "add" as const, change, first: i === 0 }));
  for (const x of inserts.get(0) ?? []) rows.push(...added(x.edit.text, x.change));
  for (let i = 1; i <= lines.length; ) {
    const hit = at.get(i);
    if (!hit) {
      rows.push({ text: lines[i - 1] });
      for (const x of inserts.get(i) ?? []) rows.push(...added(x.edit.text, x.change));
      i++;
      continue;
    }
    const old = lines.slice(i - 1, hit.edit.end);
    if (hit.kind === "delete") old.forEach((t, k) => rows.push({ text: t, mark: "del", change: hit.change, first: k === 0 }));
    else {
      const now = hit.edit.text.replace(/\n$/, "").split("\n");
      const block: Row[] = [];
      // Pair each old line with the next similar new line; what stays unpaired is shown removed, then added.
      let b = 0;
      const dels: string[] = [], adds: string[] = [];
      const flush = () => { block.push(...dels.splice(0).map((t) => ({ text: t, mark: "del" as const })), ...adds.splice(0).map((t) => ({ text: t, mark: "add" as const }))); };
      for (const line of old) {
        const k = now.slice(b, b + 3).findIndex((t) => similarity(line, t) >= 0.4);
        if (k < 0) { dels.push(line); continue; }
        adds.push(...now.slice(b, b + k));
        flush();
        const segs = wordDiff(line, now[b + k]);
        block.push(segs.every((s) => s.kind === "same") ? { text: now[b + k] } : { text: now[b + k], mark: "mod", segments: segs });
        b += k + 1;
      }
      adds.push(...now.slice(b));
      flush();
      const firstChanged = block.findIndex((r) => r.mark);
      block.forEach((r, k) => rows.push(r.mark ? { ...r, change: hit.change, first: k === firstChanged } : r));
    }
    for (const x of inserts.get(hit.edit.end) ?? []) rows.push(...added(x.edit.text, x.change));
    i = hit.edit.end + 1;
  }
  return rows;
}
