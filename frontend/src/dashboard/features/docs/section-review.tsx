/**
 * One section of an own project with the corrections of the initial check: the section reads as it will read,
 * every change is marked in place and numbered, and below it each number says why, with the code that shows it.
 * Changes can be taken one by one; the rest of the section stays as it is.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Finding } from "./generation-store";
import { applyLineEdits, changeRows } from "./line-diff";
import { InlineMarkdown, MarkdownRows } from "./markdown";
import type { LiveProposal } from "./model";
import { projectState } from "./project";
import { useDecisions } from "./store";

const KIND: Record<Finding["kind"], { label: string; tone: string }> = {
  contradicts: { label: "Stimmt nicht mehr", tone: "border-late/40 bg-late-soft text-late-fg" },
  removed: { label: "Gibt es nicht mehr", tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" },
  missing: { label: "Fehlt", tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

/** The section with only the chosen changes applied. */
const withChanges = (before: string, findings: Finding[], chosen: Set<number>) =>
  applyLineEdits(before, findings.flatMap((f, i) => (chosen.has(i) ? f.edits : [])));

export function SectionReview({ p, active, onActivate, editing, onEdit, editor }: { p: LiveProposal; active: boolean; onActivate: () => void; editing: boolean; onEdit: () => void; editor: (text: string) => ReactNode }) {
  const decide = useDecisions((s) => s.decide);
  const findings = useMemo(() => p.generation?.findings ?? [], [p.generation]);
  const [chosen, setChosen] = useState(() => new Set(findings.map((_, i) => i)));
  const [focus, setFocus] = useState<number>();
  const before = p.find ?? "";
  const rows = useMemo(() => changeRows(before, findings.map((f, i) => ({ edits: chosen.has(i) ? f.edits : [] }))), [before, findings, chosen]);
  const text = withChanges(before, findings, chosen);
  const all = chosen.size === findings.length;
  const toggle = (i: number) => setChosen((s) => { const next = new Set(s); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  const select = (n: number) => {
    setFocus(n);
    onActivate();
    document.getElementById(`f-${p.id}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const accept = () => decide(p.id, { state: "uebernommen", edited: text !== p.text ? { text } : undefined }, `${all ? "Übernommen" : `${chosen.size} von ${findings.length} Änderungen übernommen`}: ${p.title}`);

  return (
    <section
      id={`s-${p.id}`}
      onClick={onActivate}
      className={cn("-mx-4 grid scroll-mt-32 gap-4 rounded-xl px-4 py-3 transition-colors", active ? "bg-brand-50/50 ring-2 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30" : "hover:bg-muted/40")}
    >
      <MarkdownRows rows={rows} active={focus} onSelect={select} />
      {editing ? (
        editor(text)
      ) : (
        <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm" onClick={(e) => e.stopPropagation()}>
          {/* The decision first, the reasons below: with many changes the buttons stay in reach. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="grid gap-0.5">
              <strong className="text-sm font-medium">{findings.length === 1 ? "1 Änderung" : `${findings.length} Änderungen`} · Warum?</strong>
              {p.generation && <span className="text-xs text-muted-foreground">Geprüft mit {p.generation.model}{findings.some((x) => x.sure) ? " und Jev" : ""}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!chosen.size} onClick={accept}>
                <Check /> {all ? "Übernehmen" : `${chosen.size} von ${findings.length} übernehmen`}
              </Button>
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil /> Selbst ändern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide(p.id, { state: "verworfen" }, `Verworfen: ${p.title}`)}>
                <X /> Verwerfen
              </Button>
            </span>
          </div>
          <ol className="grid gap-2">
            {findings.map((f, i) => (
              <FindingItem key={i} id={`f-${p.id}-${i + 1}`} f={f} n={i + 1} checked={chosen.has(i)} focused={focus === i + 1} onToggle={() => toggle(i)} onFocus={() => setFocus(i + 1)} />
            ))}
          </ol>
          {findings.length > 1 && <p className="text-xs text-muted-foreground">Häkchen weg: diese Änderung wird nicht übernommen, der Rest schon.</p>}
        </div>
      )}
    </section>
  );
}

function FindingItem({ id, f, n, checked, focused, onToggle, onFocus }: { id: string; f: Finding; n: number; checked: boolean; focused: boolean; onToggle: () => void; onFocus: () => void }) {
  const files = projectState.project?.files.length ?? 0;
  return (
    <li id={id} onClick={onFocus} className={cn("flex scroll-mt-32 items-start gap-3 rounded-lg border p-3 transition-colors", focused ? "border-brand-300 bg-brand-50/60 dark:border-brand-500/40 dark:bg-brand-500/10" : "hover:bg-muted/40", !checked && "opacity-60")}>
      <Checkbox checked={checked} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} className="mt-0.5" aria-label={`Änderung ${n} übernehmen`} />
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums", focused ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-100")}>{n}</span>
      <div className="grid min-w-0 flex-1 gap-1.5 text-sm">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("font-normal", KIND[f.kind].tone)}>{KIND[f.kind].label}</Badge>
          {f.sure && <Badge variant="outline" className="font-normal text-muted-foreground">von Jev bestätigt</Badge>}
        </span>
        <p className="leading-snug"><InlineMarkdown text={f.explanation} /></p>
        {f.evidence.map((e, k) => (
          <figure key={k} className="grid gap-1">
            <figcaption className="text-xs text-muted-foreground">Im Code: {e.source.replace(/:(\d+)-(\d+)$/, ", Zeilen $1–$2")}</figcaption>
            <pre className="max-h-28 overflow-auto rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[12px] leading-5 whitespace-pre-wrap">{e.quote}</pre>
          </figure>
        ))}
        {f.kind === "removed" && f.absent.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {f.absent.map((a, k) => <code key={k} className="me-1 rounded bg-muted px-1 font-mono">{a}</code>)}
            kommt in keiner der {files} Code-Dateien vor.
          </p>
        )}
      </div>
    </li>
  );
}
