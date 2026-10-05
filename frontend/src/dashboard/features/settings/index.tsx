import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderGit2, HardDrive, KeyRound, LoaderCircle, RefreshCw, RotateCcw, Save, UserRound } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Main } from "@/components/layout/main";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadSetup, useSaveSettings, type Setup } from "./api";
import { SecretField, SetupForm } from "./keys-form";

function ProfileForm({ values }: { values: Record<string, string> }) {
  const [name, setName] = useState(values.NEURALDOC_USER_NAME ?? "");
  const [company, setCompany] = useState(values.NEURALDOC_USER_COMPANY ?? "");
  const [role, setRole] = useState(values.NEURALDOC_USER_ROLE ?? "");
  const save = useSaveSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4" />
          Profil
        </CardTitle>
        <CardDescription>
          Steht unten in der Seitenleiste und bei deinen Freigaben.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              NEURALDOC_USER_NAME: name.trim(),
              NEURALDOC_USER_COMPANY: company.trim(),
              NEURALDOC_USER_ROLE: role.trim(),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" maxLength={120} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-company">Unternehmen</Label>
              <Input id="profile-company" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Firma oder Team" maxLength={120} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-role">
              Rolle <span className="font-normal text-muted-foreground">· optional</span>
            </Label>
            <Input id="profile-role" autoComplete="organization-title" value={role} onChange={(e) => setRole(e.target.value)} placeholder="z. B. Produktmanagement" maxLength={120} />
          </div>
          <Button type="submit" className="w-fit" disabled={save.isPending}>
            <Save />
            {save.isPending ? "Speichert …" : "Speichern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function GitForm({ setup }: { setup: Setup }) {
  const [token, setToken] = useState("");
  const save = useSaveSettings(() => setToken(""));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderGit2 className="size-4" />
          Private GitHub-Repositories
        </CardTitle>
        <CardDescription>
          Nur nötig, wenn du ein privates Repository per URL importierst. Lesezugriff reicht.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (token.trim()) save.mutate({ NEURALDOC_GIT_TOKEN: token.trim() });
          }}
        >
          <SecretField
            id="settings-git"
            label="GitHub-Token"
            secret={setup.settings.secrets.NEURALDOC_GIT_TOKEN}
            value={token}
            onChange={setToken}
            onRemove={() => save.mutate({ NEURALDOC_GIT_TOKEN: null })}
          />
          <Button type="submit" variant="outline" className="w-fit" disabled={save.isPending || !token.trim()}>
            <Save />
            Speichern
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Status({ setup, refresh, fetching }: { setup: Setup; refresh: () => void; fetching: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle className="text-base">Bereit für eigene Projekte?</CardTitle>
          <CardDescription>Prüft die Einrichtung</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={fetching}>
          <RefreshCw />
          Aktualisieren
        </Button>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">
          <KeyRound className="mr-1 size-3" />
          Jev · {setup.jev.configured ? "Key hinterlegt" : "Key fehlt"}
        </Badge>
        <Badge variant="outline">
          {setup.drafting.label || "LLM"} · {setup.drafting.configured ? "eingerichtet" : "fehlt"}
        </Badge>
        {setup.drafting.model && <span className="text-xs text-muted-foreground">{setup.drafting.model}</span>}
        {setup.drafting.error && <p className="w-full text-xs text-muted-foreground">{setup.drafting.error}</p>}
      </CardContent>
    </Card>
  );
}

const resets = {
  projects: {
    label: "Projekte zurücksetzen",
    title: "Alle Projekte löschen?",
    text: "Importierte Projekte, Erstprüfungen, Entwürfe und Freigaben werden gelöscht. Profil und Keys bleiben. Deine Originaldateien sind nicht betroffen.",
  },
  all: {
    label: "Alles zurücksetzen",
    title: "Alles löschen?",
    text: "Zusätzlich zu allen Projekten werden Profil, Keys und Modellwahl gelöscht. neuraldoc startet danach wie frisch installiert. Deine Originaldateien sind nicht betroffen.",
  },
} as const;

function ResetCard() {
  const [pending, setPending] = useState<keyof typeof resets | null>(null);
  async function reset(scope: keyof typeof resets) {
    setPending(scope);
    try {
      const response = await fetch("/api/mcp/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Zurücksetzen fehlgeschlagen.");
      // A fresh start: every page reloads its data.
      window.location.assign(import.meta.env.BASE_URL);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Zurücksetzen fehlgeschlagen.");
      setPending(null);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="size-4" />
          Zurücksetzen
        </CardTitle>
        <CardDescription>Neu anfangen, ohne den Container neu aufzusetzen.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {(Object.keys(resets) as (keyof typeof resets)[]).map((scope) => (
          <AlertDialog key={scope}>
            <AlertDialogTrigger asChild>
              <Button variant={scope === "all" ? "destructive" : "outline"} size="sm" disabled={!!pending}>
                {pending === scope ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
                {resets[scope].label}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{resets[scope].title}</AlertDialogTitle>
                <AlertDialogDescription>{resets[scope].text}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction className={scope === "all" ? buttonVariants({ variant: "destructive" }) : undefined} onClick={() => void reset(scope)}>
                  {resets[scope].label}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ))}
      </CardContent>
    </Card>
  );
}

function Storage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="size-4" />
          Wo deine Daten liegen
        </CardTitle>
        <CardDescription>
          Nur in deinem Container
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs text-muted-foreground">
        <p>
          Profil, Keys, importierte Projekte und Freigaben liegen im Docker-Volume{" "}
          <code className="rounded bg-muted px-1 py-0.5">neuraldoc-data</code> und bleiben bei einem Neustart erhalten.
        </p>
        <p>
          Protokoll ansehen: <code className="rounded bg-muted px-1 py-0.5">docker logs neuraldoc</code>
        </p>
        <p>
          Alles löschen: <code className="rounded bg-muted px-1 py-0.5">docker rm -f neuraldoc</code> und{" "}
          <code className="rounded bg-muted px-1 py-0.5">docker volume rm neuraldoc-data</code>
        </p>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const query = useQuery({ queryKey: ["setup"], queryFn: loadSetup });
  const setup = query.data;
  const v = setup?.settings.values;
  return (
    <>
      <AppHeader crumbs={[{ label: "Einstellungen" }]} />
      <Main className="flex min-w-0 flex-col gap-6 pb-16">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Deine Installation</span>
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.025em]">Einstellungen</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Dein Name und deine eigenen Keys. Keys brauchst du erst, wenn du dein eigenes Projekt prüfst.
          </p>
        </div>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : query.isError || !setup || !v ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Einstellungen nicht erreichbar. Läuft der Container? Protokoll: docker logs neuraldoc
          </p>
        ) : !setup.editable ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Öffentlicher Showcase</CardTitle>
              <CardDescription>
                Hier gibt es nichts einzustellen. Für eigene Projekte startest du neuraldoc selbst mit Docker, siehe github.com/neuraldoc-ai/neuraldoc-app.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-5">
              <ProfileForm values={v} />
              <SetupForm
                key={[v.NEURALDOC_DRAFT_PROVIDER, v.NEURALDOC_LLM_MODEL, v.GOOGLE_CLOUD_PROJECT, v.NEURALDOC_LLM_BASE_URL, v.NEURALDOC_JEV_BUDGET_USD].join("|")}
                setup={setup}
              />
            </div>
            <div className="grid gap-5">
              <Status setup={setup} refresh={() => void query.refetch()} fetching={query.isFetching} />
              <GitForm setup={setup} />
              <ResetCard />
              <Storage />
            </div>
          </div>
        )}
      </Main>
    </>
  );
}
