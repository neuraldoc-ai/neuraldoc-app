import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Laptop, Save, X } from "lucide-react";
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
  const [fields, setFields] = useState<Record<string, string>>({
    NEURALDOC_JEV_BUDGET_USD: values.NEURALDOC_JEV_BUDGET_USD || "0.25",
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
      NEURALDOC_JEV_BUDGET_USD: fields.NEURALDOC_JEV_BUDGET_USD.trim(),
    };
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
            <p className="text-sm font-medium">Jev · findet veraltete Stellen</p>
            <SecretField
              id="setup-jev"
              label="Jev-Key (TypeSafe)"
              secret={secrets.TYPESAFE_API_KEY}
              value={keys.TYPESAFE_API_KEY ?? ""}
              onChange={(v) => setKey("TYPESAFE_API_KEY", v)}
              onRemove={() => save.mutate({ TYPESAFE_API_KEY: null })}
            />
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
          </div>
          <Separator />
          <div className="grid gap-4">
            <p className="text-sm font-medium">LLM · formuliert die Entwürfe</p>
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
