import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Braces,
  CheckCheck,
  FileCode2,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Main } from "@/components/layout/main";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArchitectureCard } from "./explainer";
import { datasetMode } from "@/features/docs/data";
import { projectState } from "@/features/docs/project";

const steps = [
  {
    title: "1. Quellen",
    text: "Code, Commits, Tickets und Dokumente liefern den Kontext.",
    icon: FileCode2,
  },
  {
    title: "2. Technischer Graph",
    text: "Parser erkennen Funktionen, Imports, Aufrufe und SQL-Beziehungen.",
    icon: GitBranch,
  },
  {
    title: "3. Jev",
    text: "Verbindet fachlich passende Komponenten und Dokumente.",
    icon: Braces,
  },
  {
    title: "4. Dein LLM",
    text: "Formuliert einen Entwurf aus den ausgewählten Belegen.",
    icon: Sparkles,
  },
  {
    title: "5. Prüfung",
    text: "Du prüfst die Quellen und entscheidest über die Änderung.",
    icon: CheckCheck,
  },
];

export function ArchitecturePage() {
  return (
    <>
      <AppHeader crumbs={[{ label: "Architektur" }]} />
      <Main className="flex min-w-0 flex-col gap-6 pb-16">
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">Verstehen</span>
          <h1 className="text-[28px] font-medium tracking-tight">
            Architektur
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Vom Code zum geprüften Dokument. Jev ordnet zu, dein LLM formuliert.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((step, i) => (
            <ArchitectureCard key={step.title} step={i} className="h-full gap-3">
              <CardHeader>
                <step.icon className="mb-2 size-5" />
                <CardTitle className="text-sm">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{step.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  Einfach erklärt <ArrowRight className="size-3" />
                </span>
              </CardContent>
              {i < 4 && (
                <ArrowRight className="pointer-events-none absolute top-12 -right-3 z-10 hidden size-5 bg-background text-muted-foreground md:block" />
              )}
            </ArchitectureCard>
          ))}
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <ArchitectureCard step={5}>
            <CardHeader>
              <CardTitle className="text-base">
                Nachvollziehbar statt blind übernehmen
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>
                Code-Beziehungen haben Quellen. Jev-Verbindungen bleiben als
                Modellzuordnung gekennzeichnet.
              </p>
              <p>
                Fehlende Belege führen zu einer Rückfrage. Jeder Entwurf
                braucht deine Prüfung.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium transition-colors group-hover:text-foreground">
                Einfach erklärt <ArrowRight className="size-3" />
              </span>
            </CardContent>
          </ArchitectureCard>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mit deinem Projekt</CardTitle>
              <CardDescription>
                {datasetMode === "working"
                  ? `Aktuell läuft dein Projekt ${projectState.project?.name}. neuraldoc schreibt nichts in deine Dateien zurück.`
                  : datasetMode === "showcase"
                    ? "Aktuell siehst du den Showcase mit erfundenen Beispieldaten."
                    : "Noch kein Projekt importiert. Zum Ausprobieren gibt es auf der Startseite das Beispielprojekt MOBIQ."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ol className="grid list-decimal gap-1.5 pl-4 text-sm text-muted-foreground">
                <li>Keys für Jev und ein LLM unter Einstellungen hinterlegen.</li>
                <li>„Eigenes Projekt“: Repository und Doku hineinziehen oder GitHub-URL angeben.</li>
                <li>„Erstprüfung starten“: Jev findet jede Stelle, an der die Doku nicht zum Code passt.</li>
                <li>„Starten“: dein LLM formuliert die Korrekturen.</li>
                <li>Prüfen, übernehmen, „Freigaben exportieren“.</li>
              </ol>
              {projectState?.canImport && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link to="/einstellungen">
                    Zu den Einstellungen <ArrowRight />
                  </Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Kosten entstehen nur bei der Erstprüfung und beim Formulieren.
                Seitenaufrufe und der Showcase rufen kein Modell auf.
              </p>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  );
}
