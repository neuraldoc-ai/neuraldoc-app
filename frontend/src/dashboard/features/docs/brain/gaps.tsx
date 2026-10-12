import { SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { projectState } from "../project";
import { nodeById } from "./model";

const KIND: Record<string, string> = { string: "Name", key: "Einstellung", type: "Typ", function: "Funktion", member: "Feld", value: "Konstante", param: "Parameter" };

/** What the documentation lacks and what it names that the code does not have; every entry opens in Erkunden. */
export function BrainGaps({ onOpen }: { onOpen: (id: string) => void }) {
  const cleanup = projectState?.codeBrain?.cleanup;
  if (!cleanup)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>Noch keine Lücken-Analyse</EmptyTitle>
          <EmptyDescription>Sie entsteht beim Import eines eigenen Projekts.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const columns = [
    {
      title: "Abschnitte ohne Code",
      hint: "Zu diesen Abschnitten wurde kein Code gefunden. Oft Einleitungen, manchmal veraltete Teile.",
      rows: cleanup.unlinked.map((id) => ({ key: id, open: `sec:${id}`, name: nodeById[`sec:${id}`]?.label ?? id, note: nodeById[`sec:${id}`]?.sub ?? "", mono: false })),
    },
    {
      title: "Im Code, nicht in der Doku",
      hint: "Namen, die andere Teile des Codes nutzen und die kein Dokument erwähnt. Kandidaten, keine Pflicht.",
      rows: cleanup.undocumented.map((u) => ({ key: `${u.path}:${u.name}`, open: `file:${u.path}`, name: u.name, note: `${KIND[u.kind] ?? u.kind} · ${u.path}:${u.line}`, mono: true })),
    },
    {
      title: "In der Doku, nicht im Code",
      hint: "Die Doku nennt diese Namen, der Code kennt sie nicht. Umbenannt, entfernt oder von einem anderen Werkzeug.",
      rows: cleanup.dead.map((d) => ({ key: d.name, open: `sec:${d.sections[0]}`, name: d.name, note: d.sections.map((s) => nodeById[`sec:${s}`]?.label).filter(Boolean).slice(0, 2).join(" · "), mono: true })),
    },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map((c) => (
        <Card key={c.title} className="gap-3 py-4">
          <CardHeader className="gap-1 px-4">
            <CardTitle className="flex items-center gap-2 text-base">
              {c.title} <Badge variant="secondary">{c.rows.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">{c.hint}</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <ScrollArea className="h-[min(60dvh,560px)]">
              <div className="grid gap-0.5 pr-3">
                {c.rows.map((r) => (
                  <Button key={r.key} variant="ghost" className="h-auto justify-start px-2 py-1.5 text-left" disabled={!nodeById[r.open]} onClick={() => onOpen(r.open)}>
                    <span className="grid min-w-0 flex-1">
                      <span className={r.mono ? "truncate font-mono text-[13px]" : "truncate text-sm"}>{r.name}</span>
                      {r.note && <span className="truncate text-xs font-normal text-muted-foreground">{r.note}</span>}
                    </span>
                  </Button>
                ))}
                {!c.rows.length && <p className="px-2 py-4 text-sm text-muted-foreground">Nichts gefunden.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
