import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, CircleCheck, CircleX, LoaderCircle, Plug, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSaveSettings, type Setup } from "./api";
import { SecretField } from "./keys-form";

type Result = { ok: boolean; message?: string };
type TestResult = {
  confluence: (Result & { site?: string; account?: string; spaces?: { key: string; name: string }[] }) | null;
  drive: (Result & { account?: string; folder?: { name?: string; ok: boolean; message?: string } | null }) | null;
};

async function test(folder: string): Promise<TestResult> {
  const response = await fetch("/api/mcp/sources/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) });
  const data = (await response.json().catch(() => ({}))) as TestResult & { error?: string };
  if (!response.ok) throw new Error(data.error || `Der Server meldet HTTP ${response.status}.`);
  return data;
}

const Line = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <span className="flex items-start gap-1.5">
    {ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> : <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
    <span>{children}</span>
  </span>
);

/** Confluence and Google Drive as live documentation: read at import, approved sections go back to Confluence. */
export function SourcesForm({ setup }: { setup: Setup }) {
  const v = setup.settings.values, secrets = setup.settings.secrets;
  const [url, setUrl] = useState(v.NEURALDOC_CONFLUENCE_URL ?? ""), [email, setEmail] = useState(v.NEURALDOC_CONFLUENCE_EMAIL ?? "");
  const [token, setToken] = useState(""), [key, setKey] = useState(""), [folder, setFolder] = useState("");
  const save = useSaveSettings(() => { setToken(""); setKey(""); });
  const check = useMutation({ mutationFn: () => test(folder), onError: (e) => toast.error(e.message) });
  const confluence = !!v.NEURALDOC_CONFLUENCE_URL && !!v.NEURALDOC_CONFLUENCE_EMAIL && !!secrets.NEURALDOC_CONFLUENCE_TOKEN?.set;
  const drive = !!secrets.NEURALDOC_GOOGLE_SA_KEY?.set;
  function submit() {
    if (key.trim()) {
      try { const parsed = JSON.parse(key) as { client_email?: string; private_key?: string }; if (!parsed.client_email || !parsed.private_key) throw new Error(); }
      catch { toast.error("Der Schlüssel ist kein JSON eines Dienstkontos (client_email und private_key fehlen)."); return; }
    }
    save.mutate({
      NEURALDOC_CONFLUENCE_URL: url.trim() || null,
      NEURALDOC_CONFLUENCE_EMAIL: email.trim() || null,
      ...(token.trim() ? { NEURALDOC_CONFLUENCE_TOKEN: token.trim() } : {}),
      ...(key.trim() ? { NEURALDOC_GOOGLE_SA_KEY: JSON.stringify(JSON.parse(key)) } : {}),
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-4" />
          Confluence und Google Drive
        </CardTitle>
        <CardDescription>
          Doku direkt aus Confluence-Bereichen und einem Drive-Ordner prüfen. Freigegebene Änderungen schreibt neuraldoc als neue Version in die Confluence-Seite, mit Kommentar und Verlauf.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{confluence ? "Confluence verbunden" : "Confluence nicht verbunden"}</Badge>
          <Badge variant="outline">{drive ? "Drive verbunden" : "Drive nicht verbunden"}</Badge>
        </div>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="settings-confluence-url">Confluence-Adresse</Label>
              <Input id="settings-confluence-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://firma.atlassian.net" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="settings-confluence-email">E-Mail des Kontos</Label>
              <Input id="settings-confluence-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
            </div>
          </div>
          <SecretField id="settings-confluence-token" label="Confluence-API-Token" secret={secrets.NEURALDOC_CONFLUENCE_TOKEN} value={token} onChange={setToken} onRemove={() => save.mutate({ NEURALDOC_CONFLUENCE_TOKEN: null })} />
          <p className="text-xs text-muted-foreground">Token unter id.atlassian.com → Sicherheit → API-Tokens. neuraldoc liest und schreibt mit den Rechten dieses Kontos.</p>
          <Separator />
          <div className="grid gap-2">
            <Label htmlFor="settings-google-key">Google-Dienstkonto (JSON-Schlüssel)</Label>
            <div className="flex gap-2">
              <Textarea id="settings-google-key" className="min-h-20 font-mono text-xs" spellCheck={false} autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
                placeholder={secrets.NEURALDOC_GOOGLE_SA_KEY?.set ? (secrets.NEURALDOC_GOOGLE_SA_KEY.source === "ui" ? "Hinterlegt. Leer lassen, um ihn zu behalten" : "Aus .env übernommen. Neuen Schlüssel einfügen, um ihn zu ersetzen") : "Inhalt der JSON-Datei einfügen"} />
              {secrets.NEURALDOC_GOOGLE_SA_KEY?.source === "ui" && (
                <Button type="button" variant="ghost" size="icon" aria-label="Google-Schlüssel entfernen" title="Entfernen" onClick={() => save.mutate({ NEURALDOC_GOOGLE_SA_KEY: null })}><X /></Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Den Drive-Ordner für die E-Mail des Dienstkontos freigeben. neuraldoc liest dort nur.</p>
          </div>
          <Button type="submit" variant="outline" className="w-fit" disabled={save.isPending}>
            <Save />
            Speichern
          </Button>
        </form>
        {(confluence || drive) && (
          <>
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="settings-drive-folder">Verbindung testen</Label>
              <div className="flex gap-2">
                <Input id="settings-drive-folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="optional: Link zum Drive-Ordner" />
                <Button type="button" variant="ghost" disabled={check.isPending} onClick={() => check.mutate()}>
                  {check.isPending ? <LoaderCircle className="animate-spin" /> : <Plug />}
                  Testen
                </Button>
              </div>
            </div>
            {check.data && (
              <div className="grid gap-1 text-xs">
                {check.data.confluence && (check.data.confluence.ok
                  ? <Line ok>Confluence: angemeldet als <strong>{check.data.confluence.account}</strong>, Bereiche {check.data.confluence.spaces?.map((s) => s.key).join(", ") || "keine"}</Line>
                  : <Line ok={false}>Confluence: {check.data.confluence.message}</Line>)}
                {check.data.drive && (check.data.drive.ok
                  ? <Line ok={check.data.drive.folder?.ok !== false}>Drive: Dienstkonto {check.data.drive.account}{check.data.drive.folder ? (check.data.drive.folder.ok ? `, Ordner „${check.data.drive.folder.name}“ lesbar` : `, ${check.data.drive.folder.message}`) : ""}</Line>
                  : <Line ok={false}>Drive: {check.data.drive.message}</Line>)}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
