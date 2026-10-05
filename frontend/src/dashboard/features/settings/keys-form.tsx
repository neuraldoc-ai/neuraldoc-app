import { useState } from "react";
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
      ? `Hinterlegt (${secret.hint}). Leer lassen = behalten`
      : "Aus .env übernommen. Hier eintragen, um zu ersetzen"
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
            Im Showcase werden keine Keys gebraucht und keine Modelle
            aufgerufen.
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
          Deine eigenen Keys. Bleiben in deinem Container.
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
            <div className="grid gap-2">
              <Label htmlFor="setup-model">Modell</Label>
              <Input
                id="setup-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={p.model}
                maxLength={200}
              />
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
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              <Save />
              {save.isPending ? "Speichert …" : "Speichern"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Speichern ruft kein Modell auf und kostet nichts.
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
