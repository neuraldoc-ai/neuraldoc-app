import { type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WorkflowVisual } from "./workflow-visual";
import "./explainer.css";

type Explanation = {
  title: string;
  summary: string;
  result: string;
  note: string;
};

const explanations: Explanation[] = [
  {
    title: "Quellen",
    summary: "Eine Änderung wird zusammen mit ihrem Kontext betrachtet.",
    result:
      "Zum Beispiel: Ein Commit verändert den Druck. Das Ticket und die bestehende Druck-Dokumentation liefern den fachlichen Kontext.",
    note: "Im Showcase sind das MOBIQ-Beispieldaten. Eigene Projekte kommen per Import dazu, weitere Quellen per Connector.",
  },
  {
    title: "Technischer Graph",
    summary:
      "Parser lesen die Struktur des Codes und machen Beziehungen sichtbar.",
    result:
      "Zum Beispiel: Eine Druckfunktion ruft eine Vorlage auf. Diese Verbindung erscheint im Company Brain mit ihrer Code-Quelle.",
    note: "Die Analyse nutzt Syntaxbäume (AST). Dynamische Aufrufe lassen sich nicht immer eindeutig auflösen.",
  },
  {
    title: "Jev",
    summary: "Jev ergänzt die technische Struktur um fachliche Zuordnungen.",
    result:
      "Zum Beispiel: Jev ordnet eine geänderte Druckfunktion der Komponente „Belege & Druck“ und einer passenden Dokumentation zu.",
    note: "Jev-Zuordnungen bleiben als Modellentscheidung erkennbar. Unsichere Ergebnisse bleiben offen.",
  },
  {
    title: "Dein LLM",
    summary:
      "Dein gewähltes Sprachmodell formuliert aus den Belegen einen Dokumentationsentwurf.",
    result:
      "Zum Beispiel: Aus der Code-Änderung und der bisherigen Doku entsteht ein Vorschlag für den Abschnitt zur Druckausgabe.",
    note: "OpenAI, Claude, Gemini oder ein lokales LLM sind konfigurierbar. Fehlende Belege führen zu einer Rückfrage.",
  },
  {
    title: "Prüfung",
    summary:
      "Du entscheidest, ob der Vorschlag fachlich stimmt und übernommen werden soll.",
    result:
      "Zum Beispiel: Du vergleichst den neuen Druck-Abschnitt mit den Quellen, korrigierst ihn bei Bedarf und gibst ihn frei.",
    note: "Jeder Entwurf braucht deine Prüfung. Das Zurückschreiben in externe Systeme ist bisher nur eine Demo.",
  },
  {
    title: "Nachvollziehbar statt blind übernehmen",
    summary:
      "Jede Verbindung und jeder Vorschlag lässt sich bis zur Quelle zurückverfolgen.",
    result:
      "Im Company Brain kannst du Belege öffnen und erkennen, welche Beziehungen aus Code stammen und welche Jev vorgeschlagen hat.",
    note: "Eine Modellzuordnung ist ein Vorschlag. Fehlende Belege werden nicht als sichere Fakten dargestellt.",
  },
];

export function ArchitectureCard({
  step,
  children,
  className,
}: {
  step: number;
  children: ReactNode;
  className?: string;
}) {
  const explanation = explanations[step];
  return (
    <Dialog>
      <Card
        className={`group relative transition-colors hover:border-foreground/25 hover:bg-muted/20 ${className ?? ""}`}
      >
        {children}
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`${explanation.title} einfach erklärt`}
            className="absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </DialogTrigger>
      </Card>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader className="gap-3 pr-6 text-left">
          <p className="text-xs text-muted-foreground">
            {step < 5 ? `Schritt ${step + 1} von 5` : "Herkunft & Vertrauen"}
          </p>
          <DialogTitle className="text-xl font-medium tracking-tight">
            {explanation.title}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {explanation.summary}
          </DialogDescription>
        </DialogHeader>
        <WorkflowVisual step={step} />
        <div className="grid gap-3">
          <p className="text-sm leading-relaxed">{explanation.result}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {explanation.note}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
