/**
 * Imported documentation as it reads: a small Markdown renderer for sections (headings, paragraphs, lists, tables,
 * code blocks, quotes, front matter, inline code, links, emphasis; HTML is reduced to its text), and the same
 * renderer for a proposed change: unchanged lines as they are, changed lines with only the changed words marked.
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

import { wordDiff, type Row, type Seg } from "./line-diff";

/* ---------- Inline Markdown ---------- */

const INLINE = /\[!\[([^\]\n]*)\]\([^)\n]*\)\]\(([^)\s]+)[^)\n]*\)|(`[^`\n]+`)|!\[([^\]\n]*)\]\([^)\n]*\)|\[([^\]\n]+)\]\(([^)\s]+)[^)\n]*\)|<(https?:\/\/[^>\s]+)>|\*\*([^*\n]+)\*\*|__([^_\n]+)__|(?<![\w*])\*([^*\n]+)\*(?!\w)|(?<![\w_])_([^_\n]+)_(?!\w)|<\/?[a-zA-Z][^>\n]*>/g;

/** Inline Markdown as React nodes; HTML tags are dropped, images become their alt text, linked images (badges) a chip. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const [whole, badge, badgeHref, code, alt, label, href, auto, bold1, bold2, em1, em2] = m;
    if (badge !== undefined) out.push(<a key={k++} href={/^https?:/.test(badgeHref) ? badgeHref : undefined} target="_blank" rel="noreferrer" className="me-1 inline-block rounded border bg-muted/50 px-1.5 text-xs text-muted-foreground no-underline">{badge || "Bild"}</a>);
    else if (code) out.push(<code key={k++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{code.slice(1, -1)}</code>);
    else if (alt !== undefined) { if (alt.trim()) out.push(<span key={k++} className="text-muted-foreground">[{alt}]</span>); }
    else if (label) out.push(<a key={k++} href={/^https?:/.test(href) ? href : undefined} target="_blank" rel="noreferrer" className="text-brand-700 underline decoration-brand-300 underline-offset-2 dark:text-brand-300">{inline(label)}</a>);
    else if (auto) out.push(<a key={k++} href={auto} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2 dark:text-brand-300">{auto}</a>);
    else if (bold1 || bold2) out.push(<strong key={k++} className="font-semibold">{inline(bold1 || bold2)}</strong>);
    else if (em1 || em2) out.push(<em key={k++}>{inline(em1 || em2)}</em>);
    else if (/^<br/i.test(whole)) out.push(" ");
    last = m.index! + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ---------- Blocks ---------- */

const diffDel = "rounded-sm bg-red-500/15 text-red-700 line-through decoration-1 dark:text-red-300";
const diffAdd = "rounded-sm bg-emerald-500/20 text-emerald-900 dark:text-emerald-100";

/** Word-diff segments without the first `skip` characters of the new line (removed text does not count). */
function withoutPrefix(segments: Seg[], skip: number): Seg[] {
  const out: Seg[] = [];
  for (const seg of segments) {
    if (skip > 0 && seg.kind !== "del") {
      const cut = Math.min(skip, seg.text.length);
      skip -= cut;
      if (seg.text.length > cut) out.push({ ...seg, text: seg.text.slice(cut) });
    } else out.push(seg);
  }
  return out;
}

/** One row's content: inline Markdown, or its word diff. */
function RowText({ row, strip }: { row: Row; strip?: (s: string) => string }) {
  const s = strip ?? ((x: string) => x);
  if (row.mark === "mod" && row.segments) {
    // The structure (list marker, heading hashes) comes from the new line and is cut off; the words are diffed.
    const shown = withoutPrefix(row.segments, row.text.length - s(row.text).length);
    return (
      <>
        {shown.map((seg, i) => (seg.kind === "same" ? <Fragment key={i}>{inline(seg.text)}</Fragment> : <span key={i} className={cn("px-0.5", seg.kind === "del" ? diffDel : diffAdd)}>{inline(seg.text)}</span>))}
      </>
    );
  }
  return <>{inline(s(row.text))}</>;
}

/** The colored frame of a row that is removed or added as a whole. */
const rowTone = (row: Row) => (row.mark === "del" ? "bg-red-500/10 text-red-700 line-through decoration-1 dark:text-red-300" : row.mark === "add" ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100" : "");

function Marker({ row, active, onSelect }: { row: Row; active?: number; onSelect?: (n: number) => void }) {
  if (!row.change || !row.first) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect?.(row.change!); }}
      className={cn("me-1.5 inline-flex size-5 shrink-0 -translate-y-px items-center justify-center rounded-full align-middle text-[11px] font-medium tabular-nums no-underline transition-colors", active === row.change ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 hover:bg-brand-200 dark:bg-brand-500/25 dark:text-brand-100")}
      aria-label={`Änderung ${row.change}`}
    >
      {row.change}
    </button>
  );
}

type Block =
  | { kind: "heading"; level: number; rows: Row[] }
  | { kind: "para" | "quote" | "front"; rows: Row[] }
  | { kind: "list"; rows: Row[] }
  | { kind: "table"; rows: Row[] }
  | { kind: "code"; rows: Row[]; lang: string }
  | { kind: "rule" | "blank"; rows: Row[] };

const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE = /^\s*\|.*\|\s*$/;

/** Rows grouped into Markdown blocks; a changed row is placed by its new text. */
function blocks(rows: Row[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  const textOf = (r: Row) => r.text;
  if (rows[0] && /^---\s*$/.test(rows[0].text)) {
    const end = rows.findIndex((r, k) => k > 0 && /^---\s*$/.test(r.text));
    if (end > 0) { out.push({ kind: "front", rows: rows.slice(0, end + 1) }); i = end + 1; }
  }
  while (i < rows.length) {
    const t = textOf(rows[i]);
    const fence = t.match(FENCE);
    if (fence) {
      const close = rows.findIndex((r, k) => k > i && new RegExp(`^\\s{0,3}${fence[1][0] === "`" ? "`" : "~"}{${fence[1].length},}\\s*$`).test(r.text));
      const end = close < 0 ? rows.length - 1 : close;
      out.push({ kind: "code", lang: fence[2].trim(), rows: rows.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    if (!t.trim()) { out.push({ kind: "blank", rows: [rows[i++]] }); continue; }
    const heading = t.match(/^(#{1,6})\s+/);
    if (heading) { out.push({ kind: "heading", level: heading[1].length, rows: [rows[i++]] }); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(t)) { out.push({ kind: "rule", rows: [rows[i++]] }); continue; }
    const group = (test: (s: string) => boolean, kind: "list" | "table" | "quote" | "para") => {
      const start = i;
      while (i < rows.length && rows[i].text.trim() && test(rows[i].text) && !FENCE.test(rows[i].text)) i++;
      out.push({ kind, rows: rows.slice(start, i) } as Block);
    };
    if (TABLE.test(t)) group((s) => TABLE.test(s), "table");
    else if (ITEM.test(t)) group((s) => ITEM.test(s) || /^\s{2,}\S/.test(s), "list");
    else if (/^\s*>/.test(t)) group((s) => /^\s*>/.test(s), "quote");
    else group((s) => !/^(#{1,6})\s/.test(s) && !TABLE.test(s) && !ITEM.test(s) && !/^\s*>/.test(s), "para");
  }
  return out;
}

const plainHtml = (s: string) => s.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, "[$1]").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** A row of a block, wrapped in its diff color and with its change marker. */
function Line({ row, active, onSelect, strip, as: Tag = "span", className }: { row: Row; active?: number; onSelect?: (n: number) => void; strip?: (s: string) => string; as?: "span" | "div"; className?: string }) {
  return (
    <Tag className={cn(row.mark && row.mark !== "mod" && "rounded-sm px-1", rowTone(row), row.change && active === row.change && "ring-2 ring-brand-300 dark:ring-brand-500/40", className)}>
      <Marker row={row} active={active} onSelect={onSelect} />
      <RowText row={row} strip={strip} />
    </Tag>
  );
}

/** A section (or its proposed change) rendered as Markdown. */
export function MarkdownRows({ rows, active, onSelect, className }: { rows: Row[]; active?: number; onSelect?: (n: number) => void; className?: string }) {
  const props = { active, onSelect };
  return (
    <div className={cn("grid gap-3", className)}>
      {blocks(rows).map((b, k) => {
        switch (b.kind) {
          case "blank":
            return b.rows[0].mark ? <Line key={k} row={b.rows[0]} {...props} as="div" className="h-3" /> : null;
          case "rule":
            return <hr key={k} className="my-1" />;
          case "front":
            return (
              <div key={k} className="grid gap-0.5 rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                {b.rows.filter((r) => !/^---\s*$/.test(r.text)).map((r, i) => <Line key={i} row={r} {...props} as="div" />)}
              </div>
            );
          case "heading":
            return (
              <p key={k} className={cn("mt-2 font-medium tracking-tight", b.level <= 2 ? "text-xl" : b.level === 3 ? "text-lg" : "text-base")}>
                <Line row={b.rows[0]} {...props} strip={(s) => s.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")} />
              </p>
            );
          case "code":
            return (
              <pre key={k} className="overflow-x-auto rounded-lg border bg-muted/40 px-4 py-3 font-mono text-[13px] leading-6">
                {b.rows.filter((r, i) => !(i === 0 && FENCE.test(r.text)) && !(i === b.rows.length - 1 && i > 0 && FENCE.test(r.text) && !r.mark)).map((r, i) => (
                  <Line key={i} row={r} {...props} as="div" className="min-h-6 whitespace-pre" />
                ))}
              </pre>
            );
          case "table": {
            const cells = (s: string) => s.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
            const body = b.rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r.text));
            const [head, ...rest] = body;
            return (
              <div key={k} className="overflow-x-auto rounded-lg border">
                <table className="w-full text-[13px] leading-normal">
                  <tbody>
                    {[head, ...rest].filter(Boolean).map((r, i) => {
                      // A changed table row: only the cells that differ show their word diff.
                      const before = r.mark === "mod" ? cells(r.segments!.filter((s) => s.kind !== "add").map((s) => s.text).join("")) : [];
                      return (
                        <tr key={i} className={cn("border-b last:border-0", i === 0 && "bg-muted/40 font-medium", rowTone(r), r.change && active === r.change && "outline-2 outline-brand-300")}>
                          {cells(r.text).map((c, j) => (
                            <td key={j} className="px-3 py-1.5 align-top [overflow-wrap:anywhere]">
                              {j === 0 && <Marker row={r} active={active} onSelect={onSelect} />}
                              {r.mark === "mod" && before[j] !== c
                                ? wordDiff(before[j] ?? "", c).map((seg, s) => (seg.kind === "same" ? <Fragment key={s}>{inline(seg.text)}</Fragment> : <span key={s} className={cn("px-0.5", seg.kind === "del" ? diffDel : diffAdd)}>{inline(seg.text)}</span>))
                                : inline(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }
          case "list":
            return (
              <ul key={k} className="grid gap-1">
                {b.rows.map((r, i) => {
                  const item = r.text.match(ITEM);
                  const depth = Math.floor((item?.[1].length ?? r.text.match(/^\s*/)![0].length) / 2);
                  return (
                    <li key={i} className="flex gap-2" style={{ paddingInlineStart: depth * 20 }}>
                      <span className="w-4 shrink-0 text-right text-muted-foreground">{item ? (/\d/.test(item[2]) ? item[2] : "•") : ""}</span>
                      <Line row={r} {...props} className="min-w-0" strip={(s) => s.replace(ITEM, "$3").replace(/^\s+/, "")} />
                    </li>
                  );
                })}
              </ul>
            );
          case "quote": {
            const note = b.rows[0].text.match(/^\s*>\s*\[!(\w+)\]/)?.[1];
            return (
              <blockquote key={k} className={cn("grid gap-1 border-s-4 ps-4 text-muted-foreground", note ? "border-brand-300 dark:border-brand-500/50" : "border-border")}>
                {note && <span className="text-xs font-medium tracking-wide text-brand-700 uppercase dark:text-brand-300">{note}</span>}
                {b.rows.filter((r) => !/^\s*>\s*\[!\w+\]\s*$/.test(r.text)).map((r, i) => <Line key={i} row={r} {...props} as="div" strip={(s) => s.replace(/^\s*>\s?/, "")} />)}
              </blockquote>
            );
          }
          default: {
            // Paragraph lines are soft-wrapped; HTML lines show only their text (e.g. the alt text of a logo).
            const shown = b.rows.map((r) => (/^\s*</.test(r.text) && !r.mark ? { ...r, text: plainHtml(r.text) } : r)).filter((r) => r.text.trim() || r.mark);
            if (!shown.length) return null;
            return (
              <p key={k} className="whitespace-pre-line">
                {shown.map((r, i) => (
                  <Fragment key={i}>
                    {i > 0 && " "}
                    <Line row={r} {...props} />
                  </Fragment>
                ))}
              </p>
            );
          }
        }
      })}
    </div>
  );
}

/** A plain section as Markdown. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <MarkdownRows rows={text.replace(/\s+$/, "").split("\n").map((t) => ({ text: t }))} className={className} />;
}

/** One line of inline Markdown (code spans, links, emphasis), e.g. a reason written by the model. */
export function InlineMarkdown({ text }: { text: string }) {
  return <>{inline(text)}</>;
}
