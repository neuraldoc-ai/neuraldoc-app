import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Laptop, Save, X } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { useSaveSettings, type Secret, type Setup } from "./api";

type Provider = "openai" | "anthropic" | "local" | "gemini" | "vertex";

const providers: Record<
  Provider,
  { label: string; model: string; key?: string; keyLabel?: string }
> = {
  openai: {
    label: "OpenAI",
    model: "gpt-4.1-mini",
    key: "OPENAI_API_KEY",
    keyLabel: "OpenAI-Key",
  },
  anthropic: {
    label: "Claude",
    model: "claude-haiku-4-5",
    key: "ANTHROPIC_API_KEY",
    keyLabel: "Claude-Key",
  },
  gemini: {
    label: "Gemini",
    model: "gemini-3.5-flash-lite",
    key: "GEMINI_API_KEY",
    keyLabel: "Gemini-Key",
  },
  vertex: {
    label: "Gemini · Google Cloud (Vertex AI)",
    model: "gemini-3.5-flash-lite",
    key: "VERTEX_API_KEY",
    keyLabel: "Vertex-API-Key",
  },
  local: {
    label: "Lokales LLM",
    model: "qwen2.5:7b",
    key: "NEURALDOC_LLM_API_KEY",
    keyLabel: "Key (nur falls dein Server einen verlangt)",
  },
};
const isProvider = (p: string): p is Provider => p in providers;

/** The optional second opinion on findings (mcp/decision.mjs). */
type Decision = "off" | "jev" | "microsoft" | "laya";
const decisions: Record<Decision, { label: string; hint: string }> = {
  off: { label: "Aus", hint: "Die Prüfung läuft mit dem LLM allein. Befunde werden nicht gegengeprüft, Streichungen bleiben zur Prüfung stehen." },
  jev: { label: "Jev · TypeSafe (Cloud, USA)", hint: "Textausschnitte gehen an TypeSafe in den USA. Klärt das vorher mit eurem Datenschutz." },
  microsoft: { label: "Microsoft-Decision-1 · Azure Foundry", hint: "Läuft in eurer Azure-Ressource. Mit einer DataZoneStandard-Bereitstellung bleibt die Verarbeitung in der EU-Datenzone." },
  laya: { label: "Laya · selbst betrieben (Open Source)", hint: "Läuft auf eurem eigenen Server (laya-serve), nichts verlässt euer Netz. Kurze Abschnitte bewertet es am besten." },
};
const isDecision = (d: string): d is Decision => d in decisions;

export function SecretField({
  id,
  label,
  secret,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  label: string;
  secret?: Secret;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  const placeholder = secret?.set
    ? secret.source === "ui"
      ? `Hinterlegt (${secret.hint}). Leer lassen, um ihn zu behalten`
      : "Aus .env übernommen. Neuen Key eintragen, um ihn zu ersetzen"
    : "Key einfügen";
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={2000}
        />
        {secret?.source === "ui" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${label} entfernen`}
            title="Entfernen"
            onClick={onRemove}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

type ModelList = { models: { id: string; label: string }[]; source: "provider" | "built-in" | "neuraldoc"; error?: string };

/** The models the provider offers. With a saved key the list comes from the provider (no model call, no cost). */
function ModelSelect({ provider, value, onChange, keySet, baseUrl }: { provider: Provider; value: string; onChange: (v: string) => void; keySet: boolean; baseUrl?: string }) {
  // The address of a local server is typed in; ask it only once typing pauses.
  const [base, setBase] = useState(baseUrl);
  useEffect(() => {
    const t = setTimeout(() => setBase(baseUrl), 600);
    return () => clearTimeout(t);
  }, [baseUrl]);
  const list = useQuery({
    queryKey: ["models", provider, keySet, base],
    queryFn: async (): Promise<ModelList> => {
      const response = await fetch("/api/mcp/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, baseUrl: base }) });
      if (!response.ok) throw new Error("Modelle konnten nicht geladen werden.");
      return response.json() as Promise<ModelList>;
    },
    staleTime: 5 * 60_000,
  });
  const models = list.data?.models ?? [];
  // A local server has its own names: take the first one it offers if the saved model is not among them.
  useEffect(() => {
    if (provider === "local" && models.length && !models.some((m) => m.id === value)) onChange(models[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, list.data]);
  const options = value && !models.some((m) => m.id === value) && provider !== "local" ? [{ id: value, label: value }, ...models] : models;
  const hint = list.isPending
    ? "Modelle werden geladen …"
    : list.data?.error
      ? list.data.error
      : list.data?.source === "built-in" && provider !== "local"
        ? "Mit gespeichertem Key siehst du alle Modelle deines Kontos."
        : null;
  return (
    <div className="grid gap-2">
      <Label htmlFor="setup-model">Modell</Label>
      <Select value={options.some((m) => m.id === value) ? value : undefined} onValueChange={onChange} disabled={!options.length}>
        <SelectTrigger id="setup-model">
          <SelectValue placeholder={list.isPending ? "Wird geladen …" : "Kein Modell gefunden"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Keys and model are entered here and stored on the server (state volume); the browser never gets them back. */
export function SetupForm({ setup }: { setup: Setup }) {
  const values = setup.settings.values;
  const secrets = setup.settings.secrets;
  const initial = values.NEURALDOC_DRAFT_PROVIDER === "claude" ? "anthropic" : values.NEURALDOC_DRAFT_PROVIDER;
  const [provider, setProvider] = useState<Provider>(
    initial && isProvider(initial) ? initial : "openai",
  );
  const [model, setModel] = useState(
    values.NEURALDOC_LLM_MODEL || providers[provider].model,
  );
  const [decision, setDecision] = useState<Decision>(isDecision(setup.decision.provider) ? setup.decision.provider : "off");
  const [fields, setFields] = useState<Record<string, string>>({
    NEURALDOC_JEV_BUDGET_USD: values.NEURALDOC_JEV_BUDGET_USD || "0.25",
    NEURALDOC_DECISION_URL: values.NEURALDOC_DECISION_URL || "",
    NEURALDOC_DECISION_MODEL: values.NEURALDOC_DECISION_MODEL || "",
    GOOGLE_CLOUD_PROJECT: values.GOOGLE_CLOUD_PROJECT || "",
    NEURALDOC_LLM_BASE_URL:
      values.NEURALDOC_LLM_BASE_URL || "http://host.docker.internal:11434/v1",
  });
  const [keys, setKeys] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const setKey = (k: string, v: string) => setKeys((f) => ({ ...f, [k]: v }));

  const save = useSaveSettings(() => setKeys({}));

  const p = providers[provider];
  const submit = () => {
    const body: Record<string, string | null> = {
      NEURALDOC_DRAFT_PROVIDER: provider,
      NEURALDOC_LLM_MODEL: model.trim() || p.model,
      NEURALDOC_DECISION_PROVIDER: decision,
    };
    if (decision === "jev" || decision === "microsoft") body.NEURALDOC_JEV_BUDGET_USD = fields.NEURALDOC_JEV_BUDGET_USD.trim();
    if (decision === "microsoft" || decision === "laya") {
      body.NEURALDOC_DECISION_URL = fields.NEURALDOC_DECISION_URL.trim();
      body.NEURALDOC_DECISION_MODEL = fields.NEURALDOC_DECISION_MODEL.trim();
    }
    if (provider === "vertex") {
      body.GOOGLE_CLOUD_PROJECT = fields.GOOGLE_CLOUD_PROJECT.trim();
      body.GOOGLE_CLOUD_LOCATION = "global";
      body.NEURALDOC_VERTEX_MODE = "express";
    }
    if (provider === "local")
      body.NEURALDOC_LLM_BASE_URL = fields.NEURALDOC_LLM_BASE_URL.trim();
    for (const [k, v] of Object.entries(keys)) if (v.trim()) body[k] = v.trim();
    save.mutate(body);
  };

  if (!setup.editable)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keys & Modell</CardTitle>
          <CardDescription>
            Der Showcase braucht keine Keys und ruft keine Modelle auf.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          Keys & Modell
        </CardTitle>
        <CardDescription>
          Deine Keys bleiben in deinem Container.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4">
            <p className="text-sm font-medium">LLM · prüft die Doku und formuliert die Korrekturen</p>
            <div className="grid gap-2">
              <Label htmlFor="setup-provider">Anbieter</Label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  const next = v as Provider;
                  setProvider(next);
                  setModel(providers[next].model);
                }}
              >
                <SelectTrigger id="setup-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(providers).map(([id, x]) => (
                    <SelectItem key={id} value={id}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {provider === "vertex" && (
              <div className="grid gap-2">
                <Label htmlFor="setup-project">Google-Cloud-Projekt-ID</Label>
                <Input
                  id="setup-project"
                  value={fields.GOOGLE_CLOUD_PROJECT}
                  onChange={(e) => set("GOOGLE_CLOUD_PROJECT", e.target.value)}
                  placeholder="mein-projekt-123"
                />
              </div>
            )}
            {provider === "local" && (
              <div className="grid gap-2">
                <Label htmlFor="setup-base" className="flex items-center gap-2">
                  <Laptop className="size-4" />
                  Adresse des Modellservers
                </Label>
                <Input
                  id="setup-base"
                  value={fields.NEURALDOC_LLM_BASE_URL}
                  onChange={(e) => set("NEURALDOC_LLM_BASE_URL", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Ollama, LM Studio oder vLLM. Im Container heißt dein Rechner
                  host.docker.internal.
                </p>
              </div>
            )}
            {p.key && (
              <SecretField
                id="setup-llm-key"
                label={p.keyLabel ?? "Key"}
                secret={secrets[p.key]}
                value={keys[p.key] ?? ""}
                onChange={(v) => setKey(p.key!, v)}
                onRemove={() => save.mutate({ [p.key!]: null })}
              />
            )}
            <ModelSelect
              provider={provider}
              value={model}
              onChange={setModel}
              keySet={!!(p.key && secrets[p.key]?.set)}
              baseUrl={provider === "local" ? fields.NEURALDOC_LLM_BASE_URL : undefined}
            />
          </div>
          <Separator />
          <div className="grid gap-4">
            <div className="grid gap-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                Entscheidungsmodell · zweite Meinung zu jedem Befund
                <Badge variant="outline" className="font-normal">optional</Badge>
              </p>
              <p className="text-xs text-muted-foreground">Bestätigt oder verwirft, was das LLM gefunden hat. Das Zuordnen von Doku und Code macht neuraldoc ohne Modell.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setup-decision">Anbieter</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as Decision)}>
                <SelectTrigger id="setup-decision">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(decisions).map(([id, x]) => (
                    <SelectItem key={id} value={id}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{decisions[decision].hint}</p>
            </div>
            {decision === "jev" && (
              <SecretField
                id="setup-jev"
                label="Jev-Key (TypeSafe)"
                secret={secrets.TYPESAFE_API_KEY}
                value={keys.TYPESAFE_API_KEY ?? ""}
                onChange={(v) => setKey("TYPESAFE_API_KEY", v)}
                onRemove={() => save.mutate({ TYPESAFE_API_KEY: null })}
              />
            )}
            {(decision === "microsoft" || decision === "laya") && (
              <div className="grid gap-2">
                <Label htmlFor="setup-decision-url">{decision === "microsoft" ? "Endpunkt der Foundry-Ressource" : "Adresse des Laya-Servers"}</Label>
                <Input
                  id="setup-decision-url"
                  value={fields.NEURALDOC_DECISION_URL}
                  onChange={(e) => set("NEURALDOC_DECISION_URL", e.target.value)}
                  placeholder={decision === "microsoft" ? "https://meine-ressource.services.ai.azure.com" : "http://host.docker.internal:8000"}
                />
              </div>
            )}
            {(decision === "microsoft" || decision === "laya") && (
              <div className="grid gap-2">
                <Label htmlFor="setup-decision-model">{decision === "microsoft" ? "Name der Bereitstellung" : "Checkpoint (leer: multilingual)"}</Label>
                <Input
                  id="setup-decision-model"
                  value={fields.NEURALDOC_DECISION_MODEL}
                  onChange={(e) => set("NEURALDOC_DECISION_MODEL", e.target.value)}
                  placeholder={decision === "microsoft" ? "microsoft-decision-1" : "multilingual"}
                />
              </div>
            )}
            {(decision === "microsoft" || decision === "laya") && (
              <SecretField
                id="setup-decision-key"
                label={decision === "microsoft" ? "API-Key der Foundry-Ressource" : "Key (nur falls dein Server einen verlangt)"}
                secret={secrets.NEURALDOC_DECISION_API_KEY}
                value={keys.NEURALDOC_DECISION_API_KEY ?? ""}
                onChange={(v) => setKey("NEURALDOC_DECISION_API_KEY", v)}
                onRemove={() => save.mutate({ NEURALDOC_DECISION_API_KEY: null })}
              />
            )}
            {(decision === "jev" || decision === "microsoft") && (
              <div className="grid gap-2">
                <Label htmlFor="setup-budget">Höchstbetrag je Prüfung (USD)</Label>
                <Input
                  id="setup-budget"
                  inputMode="decimal"
                  className="w-32"
                  value={fields.NEURALDOC_JEV_BUDGET_USD}
                  onChange={(e) => set("NEURALDOC_JEV_BUDGET_USD", e.target.value)}
                />
              </div>
            )}
            {setup.decision.error && decision === setup.decision.provider && <p className="text-xs text-destructive">{setup.decision.error}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              <Save />
              {save.isPending ? "Speichert …" : "Speichern"}
            </Button>

          </div>
        </form>
      </CardContent>
    </Card>
  );
}
