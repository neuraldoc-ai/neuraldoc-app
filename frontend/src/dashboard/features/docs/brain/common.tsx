import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Frame } from "../ui";
import {
  brain,
  edgeLabel,
  nodeById,
  nodeOrder,
  relations,
  typeLabel,
  type BrainEdge,
  type Evidence,
} from "./model";
import { typeIcon } from "./icons";

export function BrainFrame({
  lead,
  children,
}: {
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Frame title="Company Brain" lead={lead}>
      {children}
    </Frame>
  );
}
export function EvidenceBlock({ evidence }: { evidence: Evidence }) {
  return (
    <div className="grid min-w-0 gap-2">
      <p className="break-all text-xs text-muted-foreground">
        {evidence.source}
        {evidence.line ? ` · Zeile ${evidence.line}` : ""}
      </p>
      {evidence.method && (
        <p className="text-xs text-muted-foreground">{evidence.method}</p>
      )}
      {evidence.decision && (
        <div className="grid gap-1 rounded-lg border p-3 text-xs text-muted-foreground">
          <p>
            {evidence.decision.model} · Modellwahrscheinlichkeit{" "}
            {(evidence.decision.probability * 100).toFixed(1)} %
          </p>
          <p>
            Entschieden am{" "}
            {new Date(evidence.decision.createdAt).toLocaleString("de-DE")}. Die
            Wahrscheinlichkeit ist keine gemessene Trefferquote.
          </p>
          <p>
            Diese Verbindung ist eine fachliche Hypothese. „Nur belegte
            Beziehungen“ blendet sie aus.
          </p>
          <p>
            Alternativen:{" "}
            {Object.entries(evidence.decision.alternatives)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(
                ([label, value]) => `${label}: ${(value * 100).toFixed(1)} %`,
              )
              .join(" · ")}
          </p>
          {(evidence.decision.truncated ||
            !!evidence.decision.omittedCandidates) && (
            <p>
              Der Kontext wurde begrenzt; die Entscheidung deckt nur die
              geprüften Ausschnitte und Kandidaten ab.
            </p>
          )}
        </div>
      )}
      <pre className="min-w-0 rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
        {evidence.text || "Kein Textausschnitt vorhanden."}
      </pre>
    </div>
  );
}
export function EdgeDetail({
  edge,
  onSelect,
}: {
  edge: BrainEdge;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="gap-3 rounded-none border-0 bg-transparent shadow-none">
      <CardHeader>
        <CardTitle className="text-base">
          Warum besteht diese Verbindung?
        </CardTitle>
        <CardDescription>
          {edgeLabel[edge.kind]} · {edge.certainty}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button
          variant="outline"
          className="h-auto justify-start whitespace-normal text-left"
          onClick={() => onSelect(edge.source)}
        >
          {nodeById[edge.source].label}
        </Button>
        <ArrowRight className="size-4" />
        <Button
          variant="outline"
          className="h-auto justify-start whitespace-normal text-left"
          onClick={() => onSelect(edge.target)}
        >
          {nodeById[edge.target].label}
        </Button>
        <EvidenceBlock evidence={edge.evidence} />
      </CardContent>
    </Card>
  );
}
export function NodeDetail({
  id,
  onSelect,
  onFocus,
  onlyProven = false,
}: {
  id: string;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onlyProven?: boolean;
}) {
  const n = nodeById[id];
  if (!n) return null;
  const rel = relations(id).filter(
      (e) => !onlyProven || e.certainty === "belegt",
    ),
    Icon = typeIcon[n.type];
  return (
    <Card className="min-w-0 gap-3 rounded-none border-0 bg-transparent shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid min-w-0 gap-2">
          <Badge variant="outline" className="w-fit gap-1">
            <Icon className="size-3" />
            {typeLabel[n.type]}
          </Badge>
          <CardTitle className="break-words text-lg leading-snug">
            {n.label}
          </CardTitle>
          <CardDescription className="break-all">{n.sub}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {n.description && (
          <p className="text-sm text-muted-foreground">{n.description}</p>
        )}
        {n.date && (
          <p className="text-xs text-muted-foreground">
            Datum: {new Date(n.date).toLocaleDateString("de-DE")}
          </p>
        )}
        {n.mapping && (
          <div className="grid gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
            <p>
              Jev-Vorschlag:{" "}
              {n.mapping.choice === "unknown"
                ? "keine eindeutige Zuordnung"
                : nodeById[`m:${n.mapping.choice}`]?.label ||
                  n.mapping.choice}{" "}
              · {(n.mapping.probabilities[n.mapping.choice] * 100).toFixed(1)} %
              Modellwahrscheinlichkeit
            </p>
            {n.mapping.emptyContent && (
              <p>
                Es fehlt Dokumentinhalt. Aus dem Titel wird keine Verbindung
                übernommen.
              </p>
            )}
            {!!n.mapping.pendingFiles.length && (
              <>
                <p>
                  Diese Code-Zuordnungen liegen unter der Übernahmeschwelle und
                  sind noch keine Verbindungen im Graphen:
                </p>
                {n.mapping.pendingFiles.map((f) => (
                  <Button
                    key={f.id}
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start whitespace-normal text-left text-xs"
                    onClick={() => onSelect(f.id)}
                  >
                    {nodeById[f.id]?.label} · {(f.probability * 100).toFixed(1)}{" "}
                    %
                  </Button>
                ))}
              </>
            )}
          </div>
        )}
        {onlyProven && (
          <p className="text-xs text-muted-foreground">
            Es werden nur belegte Verbindungen angezeigt.
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => onFocus(id)}>
          Als Mittelpunkt erkunden <ArrowRight />
        </Button>
        {n.docId && (
          <Link
            to="/dokumente/$id"
            params={{ id: n.docId }}
            className="text-sm underline underline-offset-4"
          >
            Dokument öffnen
          </Link>
        )}
        {n.type === "feature" && (
          <Link
            to="/aenderungen"
            className="text-sm underline underline-offset-4"
          >
            Doku-Änderungen öffnen
          </Link>
        )}
        <Tabs defaultValue="relations" key={id}>
          <TabsList className="w-full">
            <TabsTrigger value="relations">
              Verbindungen ({rel.length})
            </TabsTrigger>
            <TabsTrigger value="evidence">Quellen</TabsTrigger>
          </TabsList>
          <TabsContent value="relations" className="min-w-0">
            <Accordion
              type="multiple"
              defaultValue={nodeOrder.filter((type) =>
                rel.some(
                  (e) =>
                    nodeById[e.source === id ? e.target : e.source].type ===
                    type,
                ),
              )}
            >
              {nodeOrder.map((type) => {
                const items = rel.filter(
                  (e) =>
                    nodeById[e.source === id ? e.target : e.source].type ===
                    type,
                );
                if (!items.length) return null;
                return (
                  <AccordionItem key={type} value={type}>
                    <AccordionTrigger className="py-3 text-xs">
                      {typeLabel[type]} · {items.length}
                    </AccordionTrigger>
                    <AccordionContent className="grid gap-2">
                      {items.map((e) => {
                        const other =
                          nodeById[e.source === id ? e.target : e.source];
                        return (
                          <div
                            key={e.id}
                            className="grid gap-1 rounded-lg border p-2"
                          >
                            <Button
                              variant="ghost"
                              className="h-auto justify-start px-1 py-1 text-left text-xs whitespace-normal"
                              onClick={() => onSelect(other.id)}
                            >
                              {other.label}
                            </Button>
                            <p className="px-1 text-[11px] text-muted-foreground">
                              {e.source === id ? "→" : "←"} {edgeLabel[e.kind]}{" "}
                              · {e.certainty}
                            </p>
                            <Accordion type="single" collapsible>
                              <AccordionItem value="proof" className="border-0">
                                <AccordionTrigger className="px-1 py-1 text-[11px]">
                                  Beleg ansehen
                                </AccordionTrigger>
                                <AccordionContent>
                                  <EvidenceBlock evidence={e.evidence} />
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            {!rel.length && (
              <p className="py-4 text-sm text-muted-foreground">
                Im geladenen Snapshot sind keine Beziehungen erfasst.
              </p>
            )}
          </TabsContent>
          <TabsContent value="evidence" className="grid gap-4">
            {n.evidence?.length ? (
              n.evidence.map((e, i) => <EvidenceBlock key={i} evidence={e} />)
            ) : (
              <p className="text-sm text-muted-foreground">
                Die Herkunft dieser Zuordnung steht an den einzelnen
                Verbindungen.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
export function IndexSummary({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {[
        { label: "Änderungen & Commits", types: ["feature", "commit"] },
        { label: "Funktionen & Dateien", types: ["function", "file"] },
        {
          label: "Tabellen, Views & Felder",
          types: ["table", "view", "column"],
        },
        { label: "Verbindungen mit Herkunft", types: [] },
      ].map((item) => (
        <Card key={item.label} className="gap-2 py-4">
          <CardContent className="grid gap-2">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <strong className="text-2xl font-medium tabular-nums">
              {item.types.length
                ? item.types
                    .map((t) => brain.nodes.filter((n) => n.type === t).length)
                    .join(" / ")
                : brain.edges.length}
            </strong>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MappingStatus({
  onSelect,
}: {
  onSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const analysis = brain.metadata.analysis,
    semantic = brain.metadata.semantic;
  if (!analysis) return null;
  const parsed = analysis.files.filter((f) => f.status === "parsed").length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Analysestatus und offene Zuordnungen anzeigen"
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{parsed} Dateien analysiert</span>
            {semantic?.status === "ready" ? (
              <>
                <span>{semantic.edges} Jev-Verbindungen</span>
                {!!semantic.deferred?.length && (
                  <span className="font-medium text-foreground">
                    {semantic.deferred.length} offen
                  </span>
                )}
              </>
            ) : (
              <span>Zuordnung ausstehend</span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            Analyse <ChevronDown className="size-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="grid max-h-[min(70dvh,560px)] w-[440px] max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto rounded-xl p-4"
      >
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Analysestatus</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Code liefert technische Beziehungen. Jev ergänzt fachliche
            Zuordnungen als Modellvorschlag.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {analysis.sql.filter((f) => f.status === "parsed").length}{" "}
            SQL-Dateien analysiert
          </span>
          <span>{analysis.unresolvedCalls.length} Aufrufe ungeklärt</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Statische Analyse; dynamische Aufrufe und Laufzeitverhalten bleiben
          offen.
        </p>
        {semantic?.status === "ready" ? (
          <>
            {!!semantic.deferred?.length && (
              <div className="grid gap-2 border-t pt-3">
                <h4 className="text-xs font-medium">
                  Offene Zuordnungen ({semantic.deferred.length})
                </h4>
                <div className="grid gap-0.5">
                  {semantic.deferred.map((id) => (
                    <Button
                      key={id}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-between gap-3 px-2 text-xs font-normal"
                      title={nodeById[id]?.label || id}
                      onClick={() => {
                        onSelect?.(id);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">
                        {nodeById[id]?.label || id}
                      </span>
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-1 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                {semantic.model} · {semantic.subjects} geprüft
                {semantic.createdAt &&
                  ` · ${new Date(semantic.createdAt).toLocaleDateString("de-DE")}`}
              </p>
              {semantic.usage && (
                <p>
                  {semantic.usage.requests} API-Aufrufe ·{" "}
                  {semantic.usage.cached} aus Cache · ca.{" "}
                  {semantic.usage.estimatedUsd.toLocaleString("de-DE", {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}{" "}
                  USD
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Noch keine aktuellen Jev-Zuordnungen vorhanden.
          </p>
        )}
        <Link
          to="/architektur"
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          So funktioniert die Analyse <ArrowRight className="size-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}
