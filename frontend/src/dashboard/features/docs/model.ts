/**
 * Everything the pages show is derived here from data.ts plus the session decisions.
 * The audience filter lives in `routing`: a doc type is only checked when a change
 * touches something its readers care about.
 */
import { useMemo } from "react";
import {
  backtest,
  bundles,
  changeKinds,
  docTypeOrder,
  docTypes,
  proposals,
  type Bundle,
  type ChangeKind,
  type Doc,
  type DocTypeId,
  type Nature,
  type Proposal,
} from "./data";
import { docOf, natureOf, plural, routing } from "./logic";
import { useDecisions, type Decision } from "./store";
import { useGenerated, type Generation } from './generation-store';

export type PState = "offen" | "uebernommen" | "angepasst" | "verworfen";

export const pStateLabel: Record<PState, string> = {
  offen: "Offen",
  uebernommen: "Übernommen",
  angepasst: "Angepasst übernommen",
  verworfen: "Verworfen",
};

export type LiveProposal = Proposal & { state: PState; decision?: Decision; generation?: Generation };

const stateOf = (d?: Decision): PState =>
  !d
    ? "offen"
    : d.state === "verworfen"
      ? "verworfen"
      : d.edited
        ? "angepasst"
        : "uebernommen";

export const isDone = (s: PState) => s !== "offen";

/** Reading order inside one document: by block; there replacements by text position, then new table rows, then inserted blocks. */
export function inDocumentOrder(ps: LiveProposal[]): LiveProposal[] {
  const group = (p: LiveProposal) =>
    p.op === "replace" ? 0 : p.op === "rows" ? 1 : 2;
  const textPos = (p: LiveProposal) => {
    const b = docOf(p.doc)?.blocks[p.at];
    if (!b || !p.find) return 0;
    const text =
      b.kind === "table" ? b.rows.flat().join("\n") : "text" in b ? b.text : "";
    return Math.max(0, text.indexOf(p.find));
  };
  return [...ps].sort(
    (a, b) => a.at - b.at || group(a) - group(b) || textPos(a) - textPos(b),
  );
}

/** The next document that still has open proposals, with its first open place; documents of the same changes come first. */
export function nextOpenDoc(
  all: LiveProposal[],
  current: string,
): { doc: string; proposal: string } | undefined {
  const bundleIds = new Set(
    all.filter((p) => p.doc === current).map((p) => p.bundle),
  );
  const open = all.filter((p) => p.state === "offen" && p.doc !== current);
  const next = open.find((p) => bundleIds.has(p.bundle)) ?? open[0];
  if (!next) return undefined;
  const first = inDocumentOrder(open.filter((p) => p.doc === next.doc))[0];
  return { doc: next.doc, proposal: first.id };
}

export function useProposals(): LiveProposal[] {
  const decisions = useDecisions((s) => s.decisions);
  const generated = useGenerated((s) => s.proposals);
  return useMemo(
    () =>
      proposals.map((p) => ({
        ...p,
        ...generated[p.id],
        state: stateOf(decisions[p.id]),
        decision: decisions[p.id],
      })),
    [decisions, generated],
  );
}

/* ---------- Lookups, audience filter (shared with the MCP server) ---------- */

export { bundleOf, commitOf, docOf, list, locationOf, natureOf, plural, routing, type Route } from "./logic";

export const kindsOf = (b: Bundle) => [
  ...new Set(b.aspects.map((a) => a.kind)),
];

/** Which change kinds each doc type reacts to — the filter matrix on the documents page. */
export const filterMatrix = (Object.keys(changeKinds) as ChangeKind[]).map(
  (kind) => ({
    kind,
    label: changeKinds[kind].label,
    types: Object.fromEntries(
      docTypeOrder.map((t) => [t, docTypes[t].reactsTo.includes(kind)]),
    ) as Record<DocTypeId, boolean>,
  }),
);

/* ---------- Summaries ---------- */

export type LiveBundle = Bundle & {
  nature: Nature;
  proposals: LiveProposal[];
  open: number;
  docs: string[];
  types: DocTypeId[];
};

export function useBundles(): LiveBundle[] {
  const ps = useProposals();
  return useMemo(
    () =>
      bundles.map((b) => {
        const mine = ps.filter((p) => p.bundle === b.id);
        return {
          ...b,
          nature: natureOf(b),
          proposals: mine,
          open: mine.filter((p) => p.state === "offen").length,
          docs: [...new Set(mine.map((p) => p.doc))],
          types: docTypeOrder.filter((t) =>
            mine.some((p) => docOf(p.doc).type === t),
          ),
        };
      }),
    [ps],
  );
}

export function useSummary() {
  const ps = useProposals();
  const commits = bundles.reduce((n, b) => n + b.commits.length, 0);
  const withDocs = bundles.filter((b) =>
    proposals.some((p) => p.bundle === b.id),
  ).length;
  const docsTouched = new Set(proposals.map((p) => p.doc)).size;
  const routes = bundles.flatMap((b) => routing(b));
  const skipped = routes.filter((r) => r.status === "nicht").length;
  const open = ps.filter((p) => p.state === "offen").length;
  const done = ps.length - open;
  const q = quality();
  return {
    commits,
    bundles: bundles.length,
    withDocs,
    docsTouched,
    checks: routes.length,
    skipped,
    total: ps.length,
    open,
    done,
    ...q,
  };
}

export function quality() {
  const needed = backtest.reduce((n, r) => n + r.needed, 0);
  const found = backtest.reduce((n, r) => n + r.found, 0);
  const falseAlarms = backtest.reduce((n, r) => n + r.falseAlarms, 0);
  return {
    needed,
    found,
    missed: needed - found,
    falseAlarms,
    recall: needed ? Math.round((found / needed) * 100) : 0,
    falseShare: found + falseAlarms ? Math.round((falseAlarms / (found + falseAlarms)) * 100) : 0,
  };
}

/* ---------- Applying proposals to a document ---------- */

/** Final text of a proposal: the edited version if there is one. */
export const finalText = (p: LiveProposal) =>
  p.decision?.edited?.text ?? p.text ?? "";
export const finalBlocks = (p: LiveProposal) =>
  p.decision?.edited?.blocks ?? p.blocks ?? [];
export const finalRows = (p: LiveProposal) =>
  p.decision?.edited?.rows ?? p.rows ?? [];

/* ---------- Formatting ---------- */

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });

/** How a document is named in an own project: its path in the repository (README.md, docs/setup.md). */
/** A document as people know it: its title (the Confluence page, the first heading), not the file it is stored in. */
export const docLabel = (d: Doc) => d.title || docFile(d);
/** Where the document lies in the repository, for a second line under its title. */
export const docFile = (d: Doc) => d.path?.replace(/^(repository|dokumentation)\//, "") || "";

/** The line under a change of an own project: who, when, which commit or merge request, how big. */
export function ownLead(b: Bundle) {
  const first = b.commits[0];
  const ref = b.mr && b.mr !== first?.hash ? `Merge-Request ${b.mr}` : b.commits.length > 1 ? plural(b.commits.length, "Commit", "Commits") : `Commit ${first?.hash}`;
  const size = b.stats ? `${plural(b.stats.files, "Datei", "Dateien")} (+${b.stats.additions.toLocaleString("de-DE")} −${b.stats.deletions.toLocaleString("de-DE")})` : null;
  return [b.authors?.join(", "), fmtDate(b.merged), ref, b.ticket && b.ticket !== first?.hash ? `Ticket ${b.ticket}` : null, size].filter(Boolean).join(" · ");
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Model performance derived from the historical release backtest. */
export function analytics() {
  const metrics = (found: number, needed: number, falseAlarms: number) => {
    const precision = found / (found + falseAlarms);
    const recall = found / needed;
    return {
      precision: Math.round(precision * 100),
      recall: Math.round(recall * 100),
      f1: Math.round((2 * precision * recall / (precision + recall)) * 100),
    };
  };
  const total = quality();
  return {
    total: { ...total, ...metrics(total.found, total.needed, total.falseAlarms) },
    history: backtest.map((row) => ({
      ...row,
      missed: row.needed - row.found,
      ...metrics(row.found, row.needed, row.falseAlarms),
    })),
  };
}
