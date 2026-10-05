/**
 * Evidence card: for the selected proposal, what it rests on (checks, commits, timeline) and how reliable proposals
 * of its kind have been so far (confidence intervals over the five reviewed releases). Everything is computed from
 * the data behind the proposal and from the release review, nothing is entered by hand.
 */
import { useState } from "react";
import { Check, ChevronDown, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { backtest, changeKinds, confidences, datasetMode, docTypes, sensitivities, type Confidence } from "./data";
import { brain } from "./brain/model";
import { locationOf } from "./logic";
import { bundleOf, commitOf, docOf, fmtDate, type LiveProposal } from "./model";
import { compareProportions, fmtP, pct, wilson, type Interval } from "./stats";
import { ConfidenceBadge, Hash } from "./ui";
import { useCommitViewer } from "./commit-viewer-store";

/* ---------- What the proposal rests on ---------- */

type Check = { label: string; detail: string; state: "ok" | "no" | "na" };

const blockText = (b: ReturnType<typeof docOf>["blocks"][number] | undefined) =>
  !b ? "" : b.kind === "table" ? b.rows.flat().join("\n") : "text" in b ? b.text : "";

/** Jev links from the proposal's document to changed code files of an imported project. */
const jevLinks = (p: LiveProposal) =>
  brain.edges.filter((e) => e.kind === "semantic" && e.source === `doc:${p.doc}` && e.target.startsWith("file:"));

function checksFor(p: LiveProposal): Check[] {
  const b = bundleOf(p.bundle);
  const doc = docOf(p.doc);
  const type = docTypes[doc.type];
  const found = p.commits.filter((h) => commitOf(h)).length;
  const aspects = (b?.aspects ?? []).filter((a) => a.commits.some((h) => p.commits.includes(h)));
  const hit = [...new Set(aspects.map((a) => a.kind))].filter((k) => type.reactsTo.includes(k));
  const place: Check =
    p.op === "replace" && p.find
      ? blockText(doc.blocks[p.at]).includes(p.find)
        ? { label: "Textstelle im Dokument", detail: "Der markierte Text steht wörtlich im Dokument.", state: "ok" }
        : { label: "Textstelle im Dokument", detail: "Der Text wurde nicht wörtlich gefunden.", state: "no" }
      : { label: "Einfügestelle im Dokument", detail: `Nach „${locationOf(p)}“.`, state: "ok" };
  if (datasetMode === "working") {
    const against = jevLinks(p).filter((e) => e.evidence.decision?.verdict !== "consistent");
    return [
      place,
      { label: "Widerspruch zum aktuellen Code", detail: against.length ? `Laut Jev passt der Text nicht zu ${against.map((e) => e.target.slice(5)).join(", ")} oder lässt etwas davon aus.` : "Kein belegter Widerspruch.", state: against.length ? "ok" : "no" },
      { label: "Korrektur aus Belegen", detail: p.generation?.status === "draft" ? `Mit ${p.generation.model} formuliert.` : p.generation?.status === "no_change" ? "Laut Modell stimmt der Text." : "Noch nicht formuliert.", state: p.generation?.status === "draft" ? "ok" : "no" },
      { label: "Keine offene Frage", detail: p.question || "Fachliche Prüfung des Texts steht aus.", state: p.question ? "no" : "na" },
    ];
  }
  return [
    place,
    { label: "Änderung im Code", detail: `${found} von ${p.commits.length} Commits gefunden.`, state: found === p.commits.length && found > 0 ? "ok" : "no" },
    { label: "Ticket und Merge-Request", detail: b ? `${b.ticket}, ${b.mr}` : "nicht gefunden", state: b ? "ok" : "no" },
    {
      label: "Doku-Art ist betroffen",
      detail: hit.length ? `${type.label} reagiert auf ${hit.map((k) => changeKinds[k].label).join(", ")}.` : `${type.label} reagiert auf keine dieser Änderungen.`,
      state: hit.length ? "ok" : "no",
    },
    { label: "Mehrere Commits stützen es", detail: `${p.commits.length} ${p.commits.length === 1 ? "Commit" : "Commits"}.`, state: p.commits.length > 1 ? "ok" : "na" },
    { label: "Keine offene Frage", detail: p.question ?? (p.generation ? "Fachliche Prüfung des erzeugten Texts steht aus." : "Der Code beantwortet es eindeutig."), state: p.question ? "no" : p.generation ? "na" : "ok" },
  ];
}

const checkIcon = { ok: Check, no: X, na: Minus } as const;
const checkTone = { ok: "bg-emerald-500/15 text-emerald-600", no: "bg-late-soft text-late-fg", na: "bg-muted text-muted-foreground" } as const;

function Checklist({ checks }: { checks: Check[] }) {
  const passed = checks.filter((c) => c.state === "ok").length;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Erfüllte Prüfungen</span>
          <strong className="font-medium tabular-nums">
            {passed} von {checks.length}
          </strong>
        </span>
        <span className="flex gap-1" aria-hidden>
          {checks.map((c, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", c.state === "ok" ? "bg-brand-600" : c.state === "no" ? "bg-late" : "bg-muted")} />
          ))}
        </span>
      </div>
      <ul className="grid gap-2">
        {checks.map((c) => {
          const Icon = checkIcon[c.state];
          return (
            <li key={c.label} className="flex items-start gap-2 text-xs">
              <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full", checkTone[c.state])}>
                <Icon className="size-3" aria-hidden />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm leading-tight">{c.label}</span>
                <span className="text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Commits of the change on a time line; the ones behind this proposal are filled. */
function Timeline({ p }: { p: LiveProposal }) {
  const b = bundleOf(p.bundle);
  if (!b || b.commits.length < 2) return null;
  const times = b.commits.map((c) => new Date(c.date).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const W = 288;
  const x = (t: number) => 8 + (max === min ? 0.5 : (t - min) / (max - min)) * (W - 16);
  const rows = new Map<number, number>();
  return (
    <figure className="grid gap-1">
      <figcaption className="text-xs text-muted-foreground">Wann der Code geändert wurde</figcaption>
      <svg viewBox={`0 0 ${W} 54`} role="img" aria-label="Zeitstrahl der Commits" className="w-full">
        <line x1="8" x2={W - 8} y1="30" y2="30" className="stroke-border" strokeWidth="1" />
        {b.commits.map((c) => {
          const t = new Date(c.date).getTime();
          const cx = x(t);
          const stack = rows.get(Math.round(cx / 8)) ?? 0;
          rows.set(Math.round(cx / 8), stack + 1);
          const mine = p.commits.includes(c.hash);
          return (
            <circle key={c.hash} cx={cx} cy={30 - stack * 7} r="3.5" className={mine ? "fill-brand-600 stroke-brand-700" : "fill-background stroke-muted-foreground/60"} strokeWidth="1.2">
              <title>{`${c.hash} ${c.message}`}</title>
            </circle>
          );
        })}
        <text x="8" y="50" className="fill-muted-foreground text-[9px]">
          {fmtDate(b.commits.reduce((a, c) => (c.date < a ? c.date : a), b.commits[0].date))}
        </text>
        <text x={W - 8} y="50" textAnchor="end" className="fill-muted-foreground text-[9px]">
          {fmtDate(b.commits.reduce((a, c) => (c.date > a ? c.date : a), b.commits[0].date))}
        </text>
      </svg>
      <span className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-brand-600" /> stützt diesen Vorschlag
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full border border-muted-foreground/60" /> übrige Commits der Änderung
        </span>
      </span>
    </figure>
  );
}

function Belege({ p }: { p: LiveProposal }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm">{p.why}</p>
      {p.generation && <div className="grid gap-1 text-xs text-muted-foreground">
        <span>Text erstellt mit {p.generation.model}. Diese Verweise wurden vom Modell angegeben und müssen fachlich geprüft werden:</span>
        {p.generation.evidenceIds.map((id) => <span key={id} className="break-all">{id}</span>)}
      </div>}
      <Checklist checks={checksFor(p)} />
      {datasetMode === "working" && <JevFiles p={p} />}
      <Timeline p={p} />
      <ul className="grid gap-1.5">
        {p.commits.map((h) => {
          const c = commitOf(h);
          return (
            <li key={h} className="grid gap-0.5 text-xs">
              <span className="flex flex-wrap items-center gap-1.5">
                <Hash hash={h} hashes={p.commits} />
                <span>{c?.message}</span>
              </span>
              {c && (
                <span className="text-muted-foreground">
                  {c.author}, {fmtDate(c.date)} · {c.files.length} {c.files.length === 1 ? "Datei" : "Dateien"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JevFiles({ p }: { p: LiveProposal }) {
  const links = jevLinks(p);
  if (!links.length) return null;
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">Codestellen laut Jev</span>
      {links.map((e) => (
        <span key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="break-all">{e.target.slice(5)}</span>
          {e.evidence.decision && <span className="shrink-0 tabular-nums text-muted-foreground">{{ consistent: "passt", incomplete: "fehlt in der Doku", contradicts: "widerspricht" }[e.evidence.decision.verdict ?? "contradicts"]} · {pct(e.evidence.decision.probability)}</span>}
        </span>
      ))}
    </div>
  );
}

function ProjectMethod() {
  return (
    <div className="grid gap-3 text-xs text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
      <p><strong>Erstprüfung.</strong> Jev vergleicht jeden Doku-Abschnitt mit bis zu sechs passenden Stellen im aktuellen Code. Gemeldet werden Widersprüche und fehlende Angaben, wenn das Urteil am wahrscheinlichsten ist (ab 60 % Wahrscheinlichkeit, 50 % Sicherheit). Das Sprachmodell kann danach bestätigen, dass der Text doch stimmt.</p>
      <p><strong>Korrektur.</strong> Das Sprachmodell erhält den Abschnitt und diese Codestellen. Es muss auf die Belege verweisen, eine Rückfrage stellen oder bestätigen, dass der Text stimmt.</p>
      <p><strong>Grenzen.</strong> Für eigene Projekte gibt es noch keine gemessene Trefferquote. Codestellen werden über gemeinsame Begriffe gefunden; was anders heißt, kann fehlen. Jede Korrektur muss fachlich geprüft werden.</p>
    </div>
  );
}

/* ---------- How reliable proposals of this kind have been ---------- */

const W = 288;
const LEFT = 8;
const RIGHT = 8;

type Row = { key: string; label: string; ci: Interval; active?: boolean };

/** Point estimate with its 95 % interval per row, on a shared percent axis. */
function IntervalChart({ rows, min, ticks, caption }: { rows: Row[]; min: number; ticks: number[]; caption: string }) {
  const x = (v: number) => LEFT + ((v - min) / (1 - min)) * (W - LEFT - RIGHT);
  const ROW = 38;
  const H = rows.length * ROW + 22;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={caption} className="w-full">
      {ticks.map((t, i) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1="0" y2={rows.length * ROW} className="stroke-border" strokeDasharray="2 3" />
          <text x={x(t)} y={rows.length * ROW + 14} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[9px]">
            {Math.round(t * 100)} %
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = i * ROW + 24;
        const tone = r.active ? "stroke-brand-600" : "stroke-muted-foreground/50";
        return (
          <g key={r.key} className={cn(!r.active && "opacity-80")}>
            <text x={LEFT} y={y - 12} className={cn("text-[10px]", r.active ? "fill-foreground font-medium" : "fill-muted-foreground")}>
              {r.label}
            </text>
            <text x={W - RIGHT} y={y - 12} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
              {r.ci.k}/{r.ci.n} · {pct(r.ci.p)} ({pct(r.ci.lo)}–{pct(r.ci.hi)})
            </text>
            <line x1={x(r.ci.lo)} x2={x(r.ci.hi)} y1={y} y2={y} className={tone} strokeWidth="2" />
            <line x1={x(r.ci.lo)} x2={x(r.ci.lo)} y1={y - 4} y2={y + 4} className={tone} strokeWidth="2" />
            <line x1={x(r.ci.hi)} x2={x(r.ci.hi)} y1={y - 4} y2={y + 4} className={tone} strokeWidth="2" />
            <circle cx={x(r.ci.p)} cy={y} r="4" className={r.active ? "fill-brand-600" : "fill-muted-foreground"} />
          </g>
        );
      })}
    </svg>
  );
}

const sure = sensitivities.streng;
const balanced = sensitivities.ausgewogen;
/** The three groups of proposals the release review lets us tell apart. */
const groups: Record<Confidence, { label: string; ci: Interval; text: string }> = {
  hoch: { label: "Sicher", ci: wilson(sure.found, sure.found + sure.falseAlarms), text: "Vorschläge, die schon bei strenger Einstellung kamen." },
  mittel: { label: "Wahrscheinlich", ci: wilson(balanced.found, balanced.found + balanced.falseAlarms), text: "Alle Vorschläge der ausgewogenen Einstellung." },
  pruefen: {
    label: "Kurz prüfen",
    ci: wilson(balanced.found - sure.found, balanced.found + balanced.falseAlarms - (sure.found + sure.falseAlarms)),
    text: "Nur das, was die ausgewogene Einstellung zusätzlich vorschlägt.",
  },
};

const perRelease: Row[] = backtest.map((r) => ({ key: r.release, label: `Release ${r.release}`, ci: wilson(r.found, r.needed) }));
const pooledRecall = wilson(
  backtest.reduce((n, r) => n + r.found, 0),
  backtest.reduce((n, r) => n + r.needed, 0),
);

function Statistik({ p }: { p: LiveProposal }) {
  const mine = groups[p.confidence];
  const sureG = groups.hoch;
  const prufG = groups.pruefen;
  const test = compareProportions(sureG.ci, prufG.ci);
  const rows: Row[] = (["hoch", "mittel", "pruefen"] as Confidence[]).map((c) => ({ key: c, label: groups[c].label, ci: groups[c].ci, active: c === p.confidence }));
  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h4 className="text-sm font-medium">Wie oft lagen solche Vorschläge richtig?</h4>
        <p className="text-xs text-muted-foreground">
          Dieser Vorschlag ist „{confidences[p.confidence]}“. {mine.text} Von {mine.ci.n} Vorschlägen dieser Gruppe in den letzten fünf Releases waren {mine.ci.k} richtig, mit 95 % Sicherheit
          liegt die wahre Quote zwischen {pct(mine.ci.lo)} und {pct(mine.ci.hi)}.
        </p>
        <IntervalChart rows={rows} min={0} ticks={[0, 0.25, 0.5, 0.75, 1]} caption="Trefferquote je Sicherheitsstufe mit 95-%-Intervall" />
        <p className="rounded-lg bg-muted/50 p-2.5 text-xs">
          „Sicher“ gegen „Kurz prüfen“: {pct(test.diff)} Punkte Unterschied (95 %: {pct(test.lo)} bis {pct(test.hi)}), z = {test.z.toLocaleString("de-DE", { maximumFractionDigits: 1 })}, {fmtP(test.p)}. Der Abstand
          ist also kein Zufall, die Stufen trennen wirklich.
        </p>
      </section>

      <section className="grid gap-2">
        <h4 className="text-sm font-medium">Wie vollständig war neuraldoc je Release?</h4>
        <p className="text-xs text-muted-foreground">Anteil der Stellen, die die Redaktion ändern musste und die ein Vorschlag getroffen hat.</p>
        <IntervalChart
          rows={[...perRelease, { key: "gesamt", label: "Alle fünf Releases", ci: pooledRecall, active: true }]}
          min={0.6}
          ticks={[0.6, 0.7, 0.8, 0.9, 1]}
          caption="Trefferquote je Release mit 95-%-Intervall"
        />
        <p className="text-xs text-muted-foreground">
          Je Release nur 24 bis 31 Stellen, darum sind die Intervalle breit. Zusammengefasst ({pooledRecall.n} Stellen) wird die Schätzung deutlich genauer.
        </p>
      </section>
    </div>
  );
}

function Methode() {
  return (
    <div className="grid gap-3 text-xs text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
      <p>
        <strong>Anteil mit Konfidenzintervall.</strong> Aus k richtigen von n Vorschlägen ergibt sich p = k/n. Das 95-%-Intervall ist das Wilson-Intervall:
      </p>
      <code className="block rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] leading-5">
        Mitte = (p + z²/2n) / (1 + z²/n)
        <br />
        Halbbreite = z · √(p(1−p)/n + z²/4n²) / (1 + z²/n)
        <br />z = 1,96
      </code>
      <p>Es bleibt zwischen 0 und 100 % und ist auch bei kleinen n brauchbar, anders als „p ± 1,96 · Standardfehler“.</p>
      <p>
        <strong>Vergleich zweier Gruppen.</strong> Zweiseitiger z-Test für zwei Anteile mit gepoolter Quote, dazu das Wald-Intervall der Differenz.
      </p>
      <p>
        <strong>Gruppen.</strong> „Sicher“ = Ergebnis bei strenger Einstellung. „Wahrscheinlich“ = ausgewogene Einstellung. „Kurz prüfen“ = was die ausgewogene Einstellung zusätzlich bringt (Treffer und Fehlalarme jeweils
        als Differenz). Grundlage ist der Rückblick auf Release 25.3 bis 26.3.
      </p>
      <p>
        <strong>Grenzen.</strong> Die Intervalle beschreiben Gruppen, nicht den einzelnen Vorschlag. Sie gehen davon aus, dass die Vorschläge voneinander unabhängig sind. Mehrere Vorschläge aus demselben Feature sind das nicht
        ganz, die Intervalle sind daher eher etwas zu schmal. Die Prüfungen im Reiter „Belege“ sind Regeln, keine Wahrscheinlichkeiten.
      </p>
    </div>
  );
}

/** Same card and fold behaviour as the proposals card; it always shows the proposal that was selected last. */
export function EvidenceCard({ p }: { p?: LiveProposal }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const showCommits = useCommitViewer((s) => s.show);
  return (
    <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="-m-1 flex items-center justify-between gap-2 rounded-md p-1 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            <span className="grid gap-1.5">
              <CardTitle>Evidenz</CardTitle>
              <CardDescription>{p ? p.title : "Keine Vorschläge für dieses Dokument"}</CardDescription>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", panelOpen && "rotate-180")} aria-hidden />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          {p && (
            <CardContent className="grid gap-4">
              <span className="flex flex-wrap items-center gap-1.5">
                <ConfidenceBadge confidence={p.confidence} />
                {p.commits.length > 0 && <Button
                  variant="outline"
                  size="sm"
                  className="h-auto px-2 py-0.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                  disabled={!p.commits.length}
                  aria-label={`${p.commits.length} ${p.commits.length === 1 ? "Commit" : "Commits"} ansehen`}
                  aria-haspopup="dialog"
                  onClick={(event) => showCommits(p.commits[0], p.commits, event.currentTarget)}
                >
                  {p.commits.length} {p.commits.length === 1 ? "Commit" : "Commits"}
                </Button>}
              </span>
              <Tabs defaultValue="belege" className="gap-4">
                <TabsList className="w-full">
                  <TabsTrigger value="belege">Belege</TabsTrigger>
                  {datasetMode === "showcase" && <TabsTrigger value="statistik">Statistik</TabsTrigger>}
                  <TabsTrigger value="methode">Methode</TabsTrigger>
                </TabsList>
                <TabsContent value="belege">
                  <Belege p={p} />
                </TabsContent>
                <TabsContent value="statistik">
                  {p.generation ? <p className="text-xs text-muted-foreground">Für die mit {p.generation.model} erzeugten Texte gibt es bisher keine gemessene Trefferquote. Die Demo-Statistik bewertet diese Entwürfe nicht.</p> : <Statistik p={p} />}
                </TabsContent>
                <TabsContent value="methode">
                  {datasetMode === "working" ? <ProjectMethod /> : <Methode />}
                </TabsContent>
              </Tabs>
            </CardContent>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
