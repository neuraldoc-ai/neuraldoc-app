import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Network } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { projectState } from "../project";
import { typeIcon } from "./icons";
import {
  brain,
  edgeLabel,
  nodeById,
  nodeOrder,
  relations,
  typeLabel,
  typePlural,
  type BrainEdge,
  type BrainNode,
  type NodeType,
} from "./model";

// Left of the centre what describes or plans something, right what implements or stores it.
const DOC_SIDE: NodeType[] = ["doc", "section", "feature", "ticket", "department", "person"];
// How a relation reads from the other end: "src/retry.ts – beschrieben in – Retries".
const INVERSE: Partial<Record<BrainEdge["kind"], string>> = {
  describes: "beschrieben in",
  contains: "steht in",
  names: "genannt in",
  defines: "definiert in",
  calls: "aufgerufen von",
  imports: "importiert von",
  module: "enthält",
  documents: "betroffen von",
  changes: "geändert durch",
  commit: "enthält",
  semantic: "fachlich zugeordnet",
};
const LIMIT = 6;

/** `via`: reached over one step (a document's sections, a function's file), named for the reader. */
type Neighbour = { edge: BrainEdge; other: BrainNode; outgoing: boolean; via?: string };
type Line = { id: string; d: string; strong: number; dashed: boolean };

/** How strongly a section and a file belong together, in words; null when the relation is a fact without a weight. */
function strength(edge: BrainEdge) {
  if (edge.weight === undefined) return null;
  return edge.weight >= 0.35 ? { label: "eng", level: 3 } : edge.weight >= 0.15 ? { label: "mittel", level: 2 } : { label: "lose", level: 1 };
}
const relationText = (n: Neighbour) => n.via ?? (n.outgoing ? edgeLabel[n.edge.kind] : INVERSE[n.edge.kind] ?? `← ${edgeLabel[n.edge.kind]}`);
const rank = (n: Neighbour) => (n.edge.weight ?? (n.edge.certainty === "belegt" ? 0.5 : 0.2));
const byRank = (a: Neighbour, b: Neighbour) => rank(b) - rank(a) || a.other.label.localeCompare(b.other.label, "de");

/**
 * Direct relations, then what is one step away where the reader expects it: the code a document's sections describe,
 * the documentation of the file a function lives in.
 */
function neighboursOf(id: string): Neighbour[] {
  const seen = new Set<string>([id]);
  const direct = relations(id)
    .map((edge) => ({ edge, other: nodeById[edge.source === id ? edge.target : edge.source], outgoing: edge.source === id }))
    .filter((n) => n.other && !seen.has(n.other.id) && !!seen.add(n.other.id))
    .sort(byRank);
  const node = nodeById[id], hops: { other: BrainNode; weight?: number; via: string; text: string }[] = [];
  const out = (from: string, kind: BrainEdge["kind"]) => brain.edges.filter((e) => e.kind === kind && e.source === from);
  const into = (to: string, kind: BrainEdge["kind"]) => brain.edges.filter((e) => e.kind === kind && e.target === to);
  if (node?.type === "doc")
    for (const c of out(id, "contains"))
      for (const d of out(c.target, "describes"))
        hops.push({ other: nodeById[d.target], weight: d.weight, via: `über „${nodeById[c.target]?.label}“`, text: `Der Abschnitt „${nodeById[c.target]?.label}“ beschreibt diese Datei.\n${d.evidence.text ?? ""}` });
  if (node?.type === "function" || node?.type === "symbol")
    for (const f of into(id, "defines"))
      for (const d of into(f.source, "describes"))
        hops.push({ other: nodeById[d.source], weight: d.weight, via: `über ${nodeById[f.source]?.label}`, text: `Der Abschnitt beschreibt ${nodeById[f.source]?.label}, wo ${node.label} steht.\n${d.evidence.text ?? ""}` });
  const derived = hops
    .filter((h) => h.other)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .filter((h) => !seen.has(h.other.id) && !!seen.add(h.other.id))
    .map((h): Neighbour => ({ edge: { id: `via:${id}:${h.other.id}`, source: id, target: h.other.id, kind: "describes", certainty: "abgeleitet", weight: h.weight, evidence: { source: "Code-Brain", text: h.text } }, other: h.other, outgoing: true, via: h.via }));
  return [...direct, ...derived];
}

function Dots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i <= level ? "bg-brand-600" : "bg-muted-foreground/25")} />
      ))}
    </span>
  );
}

function NeighbourCard({
  n,
  side,
  active,
  onFocus,
  onHover,
  register,
}: {
  n: Neighbour;
  side: "doc" | "code";
  active: boolean;
  onFocus: (id: string) => void;
  onHover: (id: string | null) => void;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const Icon = typeIcon[n.other.type],
    s = strength(n.edge);
  return (
    <button
      type="button"
      ref={(el) => register(n.edge.id, el)}
      onClick={() => onFocus(n.other.id)}
      onMouseEnter={() => onHover(n.edge.id)}
      onFocus={() => onHover(n.edge.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "group grid w-full min-w-0 gap-1 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-brand-500/10",
        active && "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10",
        side === "doc" && "md:text-right",
      )}
    >
      <span className={cn("flex w-full min-w-0 items-center gap-2", side === "doc" && "md:flex-row-reverse")}>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">{n.other.label}</span>
      </span>
      {n.other.sub && n.other.sub !== n.other.label && <span className="block w-full truncate text-xs text-muted-foreground">{n.other.sub}</span>}
      <span className={cn("flex w-full min-w-0 items-center gap-2 text-[11px] text-muted-foreground", side === "doc" && "md:justify-end")}>
        <span className="min-w-0 truncate">{relationText(n)}</span>
        {s && (
          <span className="inline-flex items-center gap-1" title={`Anteil ${Math.round((n.edge.weight ?? 0) * 100)} %`}>
            <Dots level={s.level} /> {s.label}
          </span>
        )}
        {n.edge.certainty === "belegt" && !s && <span>belegt</span>}
      </span>
    </button>
  );
}

function Column({
  side,
  items,
  hovered,
  onFocus,
  onHover,
  register,
  onResize,
}: {
  side: "doc" | "code";
  items: Neighbour[];
  hovered: string | null;
  onFocus: (id: string) => void;
  onHover: (id: string | null) => void;
  register: (id: string, el: HTMLElement | null) => void;
  onResize: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const groups = nodeOrder.map((type) => [type, items.filter((n) => n.other.type === type)] as const).filter(([, list]) => list.length);
  return (
    <section className="grid min-w-0 content-start gap-4" aria-label={side === "doc" ? "Doku und Fachliches" : "Code und Daten"}>
      <h2 className={cn("text-xs font-medium tracking-wide text-muted-foreground uppercase", side === "doc" && "md:text-right")}>
        {side === "doc" ? "Doku & Fachliches" : "Code & Daten"}
      </h2>
      {!groups.length && (
        <p className={cn("text-sm text-muted-foreground", side === "doc" && "md:text-right")}>
          {side === "doc" ? "Keine Doku verbunden." : "Kein Code verbunden."}
        </p>
      )}
      {groups.map(([type, list]) => {
        const shown = open[type] ? list : list.slice(0, LIMIT);
        return (
          <div key={type} className="grid gap-1.5">
            <h3 className={cn("text-xs text-muted-foreground", side === "doc" && "md:text-right")}>
              {typePlural[type]} · {list.length}
            </h3>
            {shown.map((n) => (
              <NeighbourCard key={n.edge.id} n={n} side={side} active={hovered === n.edge.id} onFocus={onFocus} onHover={onHover} register={register} />
            ))}
            {list.length > LIMIT && (
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 w-fit text-xs", side === "doc" && "md:justify-self-end")}
                onClick={() => {
                  setOpen((o) => ({ ...o, [type]: !o[type] }));
                  setTimeout(onResize, 0);
                }}
              >
                {open[type] ? "Weniger anzeigen" : `${list.length - LIMIT} weitere anzeigen`}
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function FocusCard({
  node,
  neighbours,
  hovered,
  onNetwork,
  cardRef,
}: {
  node: BrainNode;
  neighbours: Neighbour[];
  hovered: Neighbour | null;
  onNetwork: (id: string) => void;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const Icon = typeIcon[node.type];
  const counts = nodeOrder.map((t) => [t, neighbours.filter((n) => n.other.type === t).length] as const).filter(([, c]) => c);
  const preview = node.evidence?.[0]?.text;
  return (
    <Card ref={cardRef} className="gap-4 border-brand-300 py-5 shadow-md md:self-center dark:border-brand-500/40">
      <CardHeader className="gap-2 px-5">
        <Badge variant="outline" className="w-fit gap-1">
          <Icon className="size-3" /> {typeLabel[node.type]}
        </Badge>
        <CardTitle className="text-lg leading-snug break-words">{node.label}</CardTitle>
        {node.sub && node.sub !== node.label && <p className="text-xs break-all text-muted-foreground">{node.sub}</p>}
      </CardHeader>
      <CardContent className="grid gap-4 px-5">
        {!!counts.length && (
          <div className="flex flex-wrap gap-1.5">
            {counts.map(([t, c]) => (
              <Badge key={t} variant="secondary" className="font-normal">
                {c} {c === 1 ? typeLabel[t] : typePlural[t]}
              </Badge>
            ))}
          </div>
        )}
        <div className="grid min-h-24 gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs">
          {hovered ? (
            <>
              <p className="font-medium">
                {relationText(hovered)}: {hovered.other.label}
              </p>
              <p className="whitespace-pre-line text-muted-foreground">
                {hovered.edge.evidence.text?.slice(0, 280) || hovered.edge.evidence.method || "Keine Begründung gespeichert."}
              </p>
              {hovered.edge.evidence.method && hovered.edge.evidence.text && (
                <p className="text-[11px] text-muted-foreground/80">{hovered.edge.evidence.method}</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Zeig auf eine Verbindung, um zu sehen, warum sie besteht. Klick holt sie in die Mitte.</p>
          )}
        </div>
        {preview && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="group h-7 w-fit px-2 text-xs">
                Inhalt ansehen <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="mt-2 max-h-64 rounded-lg border bg-muted/30">
                <pre className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words">{preview}</pre>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNetwork(node.id)}>
            <Network /> Im Netz zeigen
          </Button>
          {node.docId && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/dokumente/$id" params={{ id: node.docId }}>
                Dokument öffnen <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One object in the middle, the documentation that describes it on the left, the code and data behind it on the
 * right, each line as strong as the tie. A click on a neighbour moves it to the middle.
 */
export function BrainExplorer({
  focusId,
  onFocus,
  onNetwork,
}: {
  focusId: string;
  onFocus: (id: string) => void;
  onNetwork: (id: string) => void;
}) {
  const node = nodeById[focusId];
  const neighbours = useMemo(() => (node ? neighboursOf(node.id) : []), [node]);
  const left = neighbours.filter((n) => DOC_SIDE.includes(n.other.type)),
    right = neighbours.filter((n) => !DOC_SIDE.includes(n.other.type));
  const [hovered, setHovered] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const container = useRef<HTMLDivElement>(null),
    centre = useRef<HTMLElement | null>(null),
    cards = useRef(new Map<string, HTMLElement>());
  const register = (id: string, el: HTMLElement | null) => {
    if (el) cards.current.set(id, el);
    else cards.current.delete(id);
  };
  const measure = () => {
    const box = container.current?.getBoundingClientRect(),
      c = centre.current?.getBoundingClientRect();
    if (!box || !c || window.matchMedia("(max-width: 767px)").matches) return setLines([]);
    const next: Line[] = [];
    for (const n of neighbours) {
      const el = cards.current.get(n.edge.id);
      if (!el) continue;
      const r = el.getBoundingClientRect(),
        doc = DOC_SIDE.includes(n.other.type);
      const x1 = (doc ? r.right : c.right) - box.left,
        y1 = (doc ? r.top + r.height / 2 : c.top + c.height / 2) - box.top;
      const x2 = (doc ? c.left : r.left) - box.left,
        y2 = (doc ? c.top + c.height / 2 : r.top + r.height / 2) - box.top;
      const dx = Math.max(24, (x2 - x1) / 2);
      next.push({ id: n.edge.id, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, strong: strength(n.edge)?.level ?? (n.edge.certainty === "belegt" ? 2 : 1), dashed: n.edge.certainty !== "belegt" });
    }
    setLines(next);
  };
  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(() => measure());
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighbours]);
  if (!node) return null;
  const hoveredNeighbour = neighbours.find((n) => n.edge.id === hovered) ?? null;
  return (
    <div ref={container} className="relative grid items-start gap-6 pb-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(0,1fr)] md:gap-x-16">
      <svg className="pointer-events-none absolute inset-0 hidden size-full overflow-visible md:block" aria-hidden>
        {lines.map((l) => (
          <path
            key={l.id}
            d={l.d}
            fill="none"
            stroke={hovered === l.id ? "var(--brand-600)" : "var(--muted-foreground)"}
            strokeOpacity={hovered && hovered !== l.id ? 0.12 : hovered === l.id ? 1 : 0.35}
            strokeWidth={hovered === l.id ? 2.5 : 0.75 + l.strong * 0.6}
            strokeDasharray={l.dashed ? "5 4" : undefined}
          />
        ))}
      </svg>
      <div className="order-2 md:order-1">
        <Column side="doc" items={left} hovered={hovered} onFocus={onFocus} onHover={setHovered} register={register} onResize={measure} />
      </div>
      <div className="order-1 md:order-2 md:self-stretch md:content-center md:grid">
        <FocusCard node={node} neighbours={neighbours} hovered={hoveredNeighbour} onNetwork={onNetwork} cardRef={(el) => (centre.current = el)} />
      </div>
      <div className="order-3">
        <Column side="code" items={right} hovered={hovered} onFocus={onFocus} onHover={setHovered} register={register} onResize={measure} />
      </div>
    </div>
  );
}

const countOf = (id: string, kinds: BrainEdge["kind"][], incoming = true) =>
  brain.edges.filter((e) => kinds.includes(e.kind) && (incoming ? e.target === id : e.source === id)).length;

/** Where to start: the documents, the code most documentation talks about, and the functions it names. */
export function ExplorerStart({ onFocus }: { onFocus: (id: string) => void }) {
  const stats = projectState?.codeBrain?.stats;
  const docs = brain.nodes.filter((n) => n.type === "doc").map((n) => ({ n, sections: countOf(n.id, ["contains"], false), links: relations(n.id).length })).sort((a, b) => b.sections - a.sections || b.links - a.links);
  const files = brain.nodes.filter((n) => n.type === "file").map((n) => ({ n, described: countOf(n.id, ["describes", "semantic", "documents"]), links: relations(n.id).length })).sort((a, b) => b.described - a.described || b.links - a.links);
  const named = brain.nodes.filter((n) => n.type === "function" || n.type === "symbol").map((n) => ({ n, named: countOf(n.id, ["names"]) })).filter((x) => x.named).sort((a, b) => b.named - a.named);
  const features = brain.nodes.filter((n) => n.type === "feature").map((n) => ({ n, links: relations(n.id).length })).sort((a, b) => b.links - a.links);
  const lists: { title: string; hint: string; rows: { n: BrainNode; note: string }[] }[] = [
    { title: "Dokumente", hint: "Was die Doku abdeckt", rows: docs.map((x) => ({ n: x.n, note: x.sections ? `${x.sections} Abschnitte` : `${x.links} Verbindungen` })) },
    { title: "Code", hint: "Am meisten beschrieben zuerst", rows: files.map((x) => ({ n: x.n, note: x.described ? `in ${x.described} ${x.described === 1 ? "Abschnitt" : "Abschnitten"} beschrieben` : "ohne Doku" })) },
    named.length
      ? { title: "Funktionen & Elemente", hint: "Von der Doku beim Namen genannt", rows: named.map((x) => ({ n: x.n, note: `in ${x.named} ${x.named === 1 ? "Abschnitt" : "Abschnitten"} genannt` })) }
      : { title: "Features", hint: "Änderungen und was sie berühren", rows: features.map((x) => ({ n: x.n, note: `${x.links} Verbindungen` })) },
  ];
  return (
    <div className="grid gap-4">
      {stats && (
        <p className="text-sm text-muted-foreground">
          {stats.linked} von {stats.sections} Doku-Abschnitten sind mit Code verbunden ({Math.round((100 * stats.linked) / Math.max(1, stats.sections))} %), {stats.linkedFiles} von {stats.codeFiles} Dateien sind beschrieben.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {lists.map((list) => (
          <Card key={list.title} className="gap-3 py-4">
            <CardHeader className="gap-1 px-4">
              <CardTitle className="text-base">{list.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{list.hint}</p>
            </CardHeader>
            <CardContent className="px-2">
              <ScrollArea className="h-[min(56dvh,520px)]">
                <div className="grid gap-0.5 pr-3">
                  {list.rows.slice(0, 200).map(({ n, note }) => {
                    const Icon = typeIcon[n.type];
                    return (
                      <Button key={n.id} variant="ghost" className="h-auto justify-start gap-2 px-2 py-1.5 text-left" onClick={() => onFocus(n.id)}>
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-sm">{n.label}</span>
                          <span className="truncate text-xs font-normal text-muted-foreground">{note}</span>
                        </span>
                      </Button>
                    );
                  })}
                  {!list.rows.length && <p className="px-2 py-4 text-sm text-muted-foreground">Noch nichts erfasst.</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
