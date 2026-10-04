import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Braces,
  Check,
  CheckCheck,
  Copy,
  FileCode2,
  GitBranch,
  KeyRound,
  Laptop,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Main } from "@/components/layout/main";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchitectureCard } from "./explainer";
import { datasetMode } from "@/features/docs/data";
import { projectState } from "@/features/docs/project";

type Provider = "openai" | "anthropic" | "local" | "gemini" | "vertex";
type Setup = {
  drafting: {
    provider?: string;
    label?: string;
    model?: string;
    configured: boolean;
    error?: string;
  };
  jev: { required: boolean; configured: boolean; model: string };
  credentials: Record<string, boolean>;
};
const providers: Record<
  Provider,
  { label: string; model: string; lines: string[] }
> = {
  openai: {
    label: "OpenAI",
    model: "gpt-4.1-mini",
    lines: ["OPENAI_API_KEY=dein-openai-key"],
  },
  anthropic: {
    label: "Claude",
    model: "claude-haiku-4-5",
    lines: ["ANTHROPIC_API_KEY=dein-claude-key"],
  },
  local: {
    label: "Lokales LLM",
    model: "qwen2.5:7b",
    lines: [
      "# Docker: host.docker.internal statt 127.0.0.1",
      "NEURALDOC_LLM_BASE_URL=http://host.docker.internal:11434/v1",
      "# Nur setzen, wenn dein lokaler Server einen Key verlangt:",
      "NEURALDOC_LLM_API_KEY=",
    ],
  },
  gemini: {
    label: "Gemini",
    model: "gemini-2.5-flash-lite",
    lines: ["GEMINI_API_KEY=dein-gemini-key"],
  },
  vertex: {
    label: "Gemini · Vertex AI",
    model: "gemini-2.5-flash-lite",
    lines: [
      "GOOGLE_CLOUD_PROJECT=deine-projekt-id",
      "GOOGLE_CLOUD_LOCATION=global",
      "NEURALDOC_VERTEX_MODE=express",
      "NEURALDOC_VERTEX_AUTH=api-key",
      "VERTEX_API_KEY=dein-vertex-key",
    ],
  },
};
function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="relative rounded-xl border bg-muted/35">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 gap-1 text-xs"
        onClick={() => {
          void navigator.clipboard
            .writeText(text)
            .then(() => {
              setCopied(true);
              setError(false);
              setTimeout(() => setCopied(false), 1800);
            })
            .catch(() => setError(true));
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Kopiert" : "Kopieren"}
      </Button>
      <pre className="overflow-x-auto p-4 pt-12 text-xs leading-relaxed">
        {text}
      </pre>
      {error && (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Bitte den Text markieren und manuell kopieren.
        </p>
      )}
    </div>
  );
}
export function ArchitecturePage() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState(providers.openai.model);
  const query = useQuery({
    queryKey: ["setup"],
    queryFn: async (): Promise<Setup> => {
      const response = await fetch("/api/mcp/setup");
      if (!response.ok)
        throw new Error("Einrichtungsstatus konnte nicht geladen werden.");
      return response.json() as Promise<Setup>;
    },
  });
  const setup = query.data;
  const template = [
    "# In .env ergänzen (ohne Docker: frontend/.env.local); vorhandenen Jev-Key behalten.",
    "TYPESAFE_API_KEY=dein-jev-key",
    "NEURALDOC_JEV_BUDGET_USD=0.25",
    "",
    `NEURALDOC_DRAFT_PROVIDER=${provider}`,
    `NEURALDOC_LLM_MODEL=${model.trim() || providers[provider].model}`,
    ...providers[provider].lines,
  ].join("\n");
  return (
    <>
      <AppHeader crumbs={[{ label: "Architektur" }]} />
      <Main className="flex min-w-0 flex-col gap-6 pb-16">
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">
            Verstehen & einrichten
          </span>
          <h1 className="text-[28px] font-medium tracking-tight">
            Architektur
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Vom Code zum geprüften Dokument. Jev ordnet zu, dein LLM formuliert.
          </p>
        </div>
        <Tabs defaultValue="overview" className="grid gap-5">
          <TabsList className="w-fit">
            <TabsTrigger value="overview">So funktioniert es</TabsTrigger>
            <TabsTrigger value="setup">Lokal starten</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-5">
              {[
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
              ].map((step, i) => (
                <ArchitectureCard
                  key={step.title}
                  step={i}
                  className="h-full gap-3"
                >
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
            <p className="max-w-3xl text-xs text-muted-foreground">
              {datasetMode === "working"
                ? `Aktuell läuft dein Projekt ${projectState.project?.name}. Freigegebene Texte lädst du als ZIP herunter; neuraldoc schreibt nichts in deine Dateien zurück.`
                : "Aktuell läuft der Showcase mit MOBIQ-Beispieldaten. Eigene Daten importierst du in der Übersicht über „Eigenes Projekt“."}
            </p>
          </TabsContent>
          <TabsContent value="setup" className="grid gap-5">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle className="text-base">
                    Aktuelle Einrichtung
                  </CardTitle>
                  <CardDescription>
                    Zeigt Konfiguration, führt keine Modellanfrage aus.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void query.refetch()}
                  disabled={query.isFetching}
                >
                  <RefreshCw />
                  Aktualisieren
                </Button>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {query.isPending ? (
                  <p className="text-sm text-muted-foreground">
                    Status wird geladen …
                  </p>
                ) : query.isError ? (
                  <p role="alert" className="text-sm text-muted-foreground">
                    Status nicht erreichbar. Node-Server prüfen und erneut
                    laden.
                  </p>
                ) : (
                  <>
                    <Badge variant="outline">
                      <KeyRound className="mr-1 size-3" />
                      Jev · Pflicht ·{" "}
                      {setup?.jev.configured ? "Key hinterlegt" : "Key fehlt"}
                    </Badge>
                    <Badge variant="outline">
                      {setup?.drafting.label || "LLM"} ·{" "}
                      {setup?.drafting.configured
                        ? "konfiguriert"
                        : "Einrichtung fehlt"}
                    </Badge>
                    {setup?.drafting.model && (
                      <span className="text-xs text-muted-foreground">
                        {setup.drafting.model}
                      </span>
                    )}
                    {setup?.drafting.error && (
                      <p className="w-full text-xs text-muted-foreground">
                        {setup.drafting.error}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            <div className="grid items-start gap-5 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="grid gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      1. Projekt vorbereiten
                    </CardTitle>
                    <CardDescription>
                      Nur Git und Docker nötig. Repository klonen, Image bauen,
                      .env.example nach .env kopieren:
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Code
                      text={
                        "git clone --recursive https://github.com/neuraldoc-ai/neuraldoc-app.git\ncd neuraldoc-app\ndocker build -t neuraldoc .\ncp .env.example .env   # Windows: Copy-Item .env.example .env"
                      }
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      3. Starten & eigene Daten prüfen
                    </CardTitle>
                    <CardDescription>
                      Git-Repository und Doku-Ordner in den Ordner projects
                      legen, dann:
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <Code
                      text={
                        'docker run -d --name neuraldoc -p 8080:8080 --env-file .env -v neuraldoc-data:/data -v "$(pwd)/projects:/projects:ro" neuraldoc'
                      }
                    />
                    <ol className="grid list-decimal gap-1 pl-4 text-xs text-muted-foreground">
                      <li>Übersicht → „Eigenes Projekt“: /projects/… angeben.</li>
                      <li>„Mit Jev zuordnen“: Jev findet die betroffenen Dokumente.</li>
                      <li>„Starten“: dein LLM formuliert die Entwürfe.</li>
                      <li>Prüfen, übernehmen, „Freigaben exportieren“.</li>
                    </ol>
                    <p className="text-xs text-muted-foreground">
                      Öffnen:{" "}
                      <a className="underline underline-offset-4" href="/app/">
                        http://localhost:8080/app/
                      </a>
                      . Bei geänderten Keys oder Modellen den Container mit
                      docker rm -f neuraldoc entfernen und neu starten; die
                      Daten bleiben im Volume.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kosten entstehen nur bei „Mit Jev zuordnen“ und beim
                      Formulieren. Seitenaufrufe und der Showcase rufen kein
                      Modell auf. Nur Showcase ohne Import:
                      NEURALDOC_MODE=showcase.
                    </p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    2. Jev + ein LLM einrichten
                  </CardTitle>
                  <CardDescription>
                    Zeilen in .env ergänzen oder ersetzen. Schlüssel bleiben
                    auf dem Server.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="architecture-provider">
                      Beispiel für den LLM-Anbieter
                    </Label>
                    <Select
                      value={provider}
                      onValueChange={(p) => {
                        const v = p as Provider;
                        setProvider(v);
                        setModel(providers[v].model);
                      }}
                    >
                      <SelectTrigger id="architecture-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(providers).map(([id, p]) => (
                          <SelectItem key={id} value={id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="architecture-model">Modellname</Label>
                    <Input
                      id="architecture-model"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={providers[provider].model}
                      maxLength={200}
                    />
                    <p className="text-xs text-muted-foreground">
                      Wähle ein verfügbares Modell mit JSON-Ausgabe. Die Auswahl
                      erzeugt nur eine Vorlage; wirksam wird sie nach dem
                      Speichern und Neustart.
                    </p>
                  </div>
                  <Code text={template} />
                  {provider === "local" && (
                    <div className="grid gap-3 rounded-xl border p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Laptop className="size-4" />
                        Lokalen Modellserver zuerst starten
                      </p>
                      <Code
                        text={
                          "# Beispiel mit Ollama:\nollama pull qwen2.5:7b\nollama serve"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Auch LM Studio oder vLLM: deren /v1-URL und geladenen
                        Modellnamen eintragen. Wenn JSON Schema nicht
                        unterstützt wird, NEURALDOC_LLM_FORMAT=json_object
                        setzen. Die App validiert die Antwort weiterhin.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Jev bleibt auch mit lokalem LLM erforderlich und läuft über
                    die TypeSafe API. Keine Schlüssel mit VITE_-Präfix verwenden
                    oder ins Repository übernehmen.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
