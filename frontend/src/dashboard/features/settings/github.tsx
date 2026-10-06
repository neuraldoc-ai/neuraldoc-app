import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck, CircleX, ExternalLink, GitPullRequest, LoaderCircle, Plug, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSaveSettings, type Setup } from "./api";
import { SecretField } from "./keys-form";

type TestResult = { auth: "app" | "token"; account: string; repositories: { origin: string; repo: string; base?: string; ok: boolean; message: string }[] };

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Der Server meldet HTTP ${response.status}.`);
  return data;
}

/** GitHub's "create app from manifest": the browser posts the manifest to GitHub, which sends it back with a code. */
async function createApp(name: string, org: string) {
  const { action, manifest } = await post<{ action: string; manifest: string }>("/api/mcp/github/app/manifest", { name, org });
  const form = document.createElement("form");
  form.method = "post";
  form.action = action;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "manifest";
  input.value = manifest;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

/** After GitHub created the app it sends the browser back to the settings with the result in the address. */
function useReturnFromGitHub() {
  const [result] = useState(() => new URLSearchParams(window.location.search));
  useEffect(() => {
    const state = result.get("github");
    if (!state) return;
    if (state === "installieren") toast.success("GitHub-App erstellt. Jetzt noch für deine Repositories installieren.");
    else toast.error(result.get("grund") || "Die GitHub-App wurde nicht erstellt.");
    window.history.replaceState(null, "", window.location.pathname);
  }, [result]);
  const slug = result.get("github") === "installieren" ? result.get("slug") : null;
  return slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : null;
}

function AppTab({ setup }: { setup: Setup }) {
  const v = setup.settings.values;
  const key = setup.settings.secrets.NEURALDOC_GITHUB_APP_PRIVATE_KEY;
  const connected = !!v.NEURALDOC_GITHUB_APP_ID && key?.set;
  const returned = useReturnFromGitHub();
  const [name, setName] = useState(() => `neuraldoc-${crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4, "0")}`);
  const [org, setOrg] = useState("");
  const [manual, setManual] = useState({ id: v.NEURALDOC_GITHUB_APP_ID ?? "", slug: v.NEURALDOC_GITHUB_APP_SLUG ?? "", key: "", api: v.NEURALDOC_GITHUB_API_URL ?? "" });
  const [pending, setPending] = useState(false);
  const save = useSaveSettings(() => setManual((m) => ({ ...m, key: "" })));
  const installUrl = returned ?? (v.NEURALDOC_GITHUB_APP_SLUG ? `https://github.com/apps/${v.NEURALDOC_GITHUB_APP_SLUG}/installations/new` : null);
  return (
    <div className="grid gap-4">
      {connected ? (
        <div className="grid gap-2 rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <CircleCheck className="size-4 text-emerald-600" />
            {v.NEURALDOC_GITHUB_APP_SLUG ? `${v.NEURALDOC_GITHUB_APP_SLUG}[bot]` : `GitHub-App ${v.NEURALDOC_GITHUB_APP_ID}`}
          </span>
          <span className="text-xs text-muted-foreground">
            Pull-Requests und Commits erscheinen unter diesem Namen. Die App muss für jedes Repository installiert sein, in das neuraldoc schreiben soll.
          </span>
          <span className="flex flex-wrap gap-2">
            {installUrl && (
              <Button asChild size="sm" variant={returned ? "default" : "outline"}>
                <a href={installUrl} target="_blank" rel="noreferrer"><ExternalLink />Für Repositories installieren</a>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => save.mutate({ NEURALDOC_GITHUB_APP_ID: null, NEURALDOC_GITHUB_APP_SLUG: null, NEURALDOC_GITHUB_APP_PRIVATE_KEY: null })}>
              App trennen
            </Button>
          </span>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPending(true);
            createApp(name.trim(), org.trim()).catch((error: unknown) => { toast.error(error instanceof Error ? error.message : "Das hat nicht geklappt."); setPending(false); });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gh-app-name">Name der App</Label>
              <Input id="gh-app-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={34} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gh-app-org">
                Organisation <span className="font-normal text-muted-foreground">· optional</span>
              </Label>
              <Input id="gh-app-org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="leer: dein Konto" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            GitHub zeigt dir die App mit genau diesen Rechten: Contents und Pull requests schreiben, Metadaten lesen. Nach dem Bestätigen kommst du hierher zurück und installierst sie für deine Repositories. Der Name muss auf GitHub eindeutig sein.
          </p>
          <Button type="submit" className="w-fit" disabled={pending || !name.trim()}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Plug />}
            GitHub-App erstellen
          </Button>
        </form>
      )}
      <details className="group text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">App-Daten selbst eintragen (vorhandene App, GitHub Enterprise)</summary>
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              NEURALDOC_GITHUB_APP_ID: manual.id.trim() || null,
              NEURALDOC_GITHUB_APP_SLUG: manual.slug.trim() || null,
              NEURALDOC_GITHUB_API_URL: manual.api.trim() || null,
              ...(manual.key.trim() ? { NEURALDOC_GITHUB_APP_PRIVATE_KEY: manual.key.trim() } : {}),
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gh-app-id">App-ID</Label>
              <Input id="gh-app-id" inputMode="numeric" value={manual.id} onChange={(e) => setManual({ ...manual, id: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gh-app-slug">Kurzname (Slug)</Label>
              <Input id="gh-app-slug" value={manual.slug} onChange={(e) => setManual({ ...manual, slug: e.target.value })} placeholder="neuraldoc-acme" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gh-app-key">Privater Schlüssel (.pem)</Label>
            <Textarea
              id="gh-app-key"
              rows={3}
              spellCheck={false}
              className="font-mono text-xs"
              value={manual.key}
              onChange={(e) => setManual({ ...manual, key: e.target.value })}
              placeholder={key?.set ? (key.source === "ui" ? "Hinterlegt. Leer lassen, um ihn zu behalten" : "Aus .env übernommen") : "-----BEGIN RSA PRIVATE KEY-----"}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gh-api">
              API-URL <span className="font-normal text-muted-foreground">· nur GitHub Enterprise Server</span>
            </Label>
            <Input id="gh-api" value={manual.api} onChange={(e) => setManual({ ...manual, api: e.target.value })} placeholder="https://github.example.com/api/v3" />
          </div>
          <Button type="submit" variant="outline" className="w-fit" disabled={save.isPending}>
            <Save />
            Speichern
          </Button>
        </form>
      </details>
    </div>
  );
}

function TokenTab({ setup }: { setup: Setup }) {
  const [token, setToken] = useState("");
  const save = useSaveSettings(() => setToken(""));
  return (
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
      <p className="text-xs text-muted-foreground">
        Fine-grained Token nur für die betroffenen Repositories, mit Contents und Pull requests: Lesen und Schreiben. Pull-Requests erscheinen unter deinem Konto, die Commits mit dem Autor neuraldoc. Der Token dient auch dem Import privater Repositories; dafür reicht Lesezugriff.
      </p>
      <Button type="submit" variant="outline" className="w-fit" disabled={save.isPending || !token.trim()}>
        <Save />
        Speichern
      </Button>
    </form>
  );
}

/** When and how neuraldoc opens pull requests. */
function PullRequestOptions({ values }: { values: Record<string, string> }) {
  const [mode, setMode] = useState(values.NEURALDOC_GITHUB_PR || "auto");
  const [group, setGroup] = useState(values.NEURALDOC_GITHUB_PR_GROUP || "repository");
  const [prefix, setPrefix] = useState(values.NEURALDOC_GITHUB_BRANCH_PREFIX || "neuraldoc/");
  const [labels, setLabels] = useState(values.NEURALDOC_GITHUB_LABELS || "documentation, neuraldoc");
  const [reviewers, setReviewers] = useState(values.NEURALDOC_GITHUB_REVIEWERS ?? "");
  const [draft, setDraft] = useState(values.NEURALDOC_GITHUB_DRAFT_PR === "true");
  const save = useSaveSettings();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          NEURALDOC_GITHUB_PR: mode,
          NEURALDOC_GITHUB_PR_GROUP: group,
          NEURALDOC_GITHUB_BRANCH_PREFIX: prefix.trim() || null,
          NEURALDOC_GITHUB_LABELS: labels.trim() || null,
          NEURALDOC_GITHUB_REVIEWERS: reviewers.trim() || null,
          NEURALDOC_GITHUB_DRAFT_PR: draft ? "true" : null,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="gh-mode">Wann</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger id="gh-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatisch nach jeder Freigabe</SelectItem>
              <SelectItem value="manual">Nur auf Knopfdruck</SelectItem>
              <SelectItem value="off">Aus</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gh-group">Bündeln</Label>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger id="gh-group"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="repository">Ein Pull-Request je Repository</SelectItem>
              <SelectItem value="document">Ein Pull-Request je Dokument</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="gh-prefix">Branch-Präfix</Label>
          <Input id="gh-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gh-labels">Labels</Label>
          <Input id="gh-labels" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="durch Komma getrennt" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gh-reviewers">
          Reviewer <span className="font-normal text-muted-foreground">· optional</span>
        </Label>
        <Input id="gh-reviewers" value={reviewers} onChange={(e) => setReviewers(e.target.value)} placeholder="GitHub-Namen, durch Komma getrennt" />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={draft} onCheckedChange={setDraft} />
        Als Entwurf öffnen
      </label>
      <Button type="submit" variant="outline" className="w-fit" disabled={save.isPending}>
        <Save />
        Speichern
      </Button>
    </form>
  );
}

/** GitHub: approved changes become pull requests by neuraldoc; the same connection imports private repositories. */
export function GitHubForm({ setup }: { setup: Setup }) {
  const v = setup.settings.values;
  const app = !!v.NEURALDOC_GITHUB_APP_ID && !!setup.settings.secrets.NEURALDOC_GITHUB_APP_PRIVATE_KEY?.set;
  const token = !!setup.settings.secrets.NEURALDOC_GIT_TOKEN?.set;
  const test = useMutation({ mutationFn: () => post<TestResult>("/api/mcp/github/test", {}), onError: (e) => toast.error(e.message) });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitPullRequest className="size-4" />
          GitHub
        </CardTitle>
        <CardDescription>
          Übernommene Änderungen landen als Pull-Request im Repository, wie bei Dependabot oder Renovate. Der Basis-Branch wird nie direkt geändert.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{app ? "Verbunden als GitHub-App" : token ? "Verbunden mit Token" : "Nicht verbunden"}</Badge>
          {(app || token) && (
            <Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? <LoaderCircle className="animate-spin" /> : <Plug />}
              Verbindung testen
            </Button>
          )}
        </div>
        {test.data && (
          <div className="grid gap-1 text-xs">
            <span>Angemeldet als <strong>{test.data.account}</strong></span>
            {test.data.repositories.map((r) => (
              <span key={r.origin} className="flex items-start gap-1.5">
                {r.ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> : <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
                {r.repo}{r.base ? ` → ${r.base}` : ""}: {r.message}
              </span>
            ))}
            {!test.data.repositories.length && <span className="text-muted-foreground">Das aktive Projekt hat noch kein GitHub-Repository.</span>}
          </div>
        )}
        <Tabs defaultValue={token && !app ? "token" : "app"}>
          <TabsList>
            <TabsTrigger value="app">GitHub-App · empfohlen</TabsTrigger>
            <TabsTrigger value="token">Persönlicher Token</TabsTrigger>
          </TabsList>
          <TabsContent value="app" className="pt-3">
            <AppTab setup={setup} />
          </TabsContent>
          <TabsContent value="token" className="pt-3">
            <TokenTab setup={setup} />
            {app && <p className="mt-3 text-xs text-muted-foreground">Ist eine GitHub-App eingerichtet, schreibt neuraldoc über die App.</p>}
          </TabsContent>
        </Tabs>
        <Separator />
        <div className="grid gap-3">
          <p className="text-sm font-medium">Pull-Requests</p>
          <PullRequestOptions key={[v.NEURALDOC_GITHUB_PR, v.NEURALDOC_GITHUB_PR_GROUP, v.NEURALDOC_GITHUB_BRANCH_PREFIX, v.NEURALDOC_GITHUB_LABELS, v.NEURALDOC_GITHUB_REVIEWERS, v.NEURALDOC_GITHUB_DRAFT_PR].join("|")} values={v} />
        </div>
      </CardContent>
    </Card>
  );
}
