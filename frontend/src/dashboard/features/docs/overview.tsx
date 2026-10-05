/**
 * Overview: what to do now (the open changes, biggest first, with effort), questions for a person,
 * and what neuraldoc already did so nobody has to.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleHelp, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { docTypes, release, datasetMode } from "./data";
import { ProjectControls, StartCheck } from "./project-controls";
import { projectState } from "./project";
import {
  docOf,
  fmtDate,
  plural,
  routing,
  useBundles,
  useProposals,
  useSummary,
} from "./model";
import { Frame, NatureBadge } from "./ui";
import { blueSoft, typeIcon } from "./overview-icons";
import { StartReview } from './start-review';

export function OverviewPage() {
  const sum = useSummary();
  const bundles = useBundles();
  const ps = useProposals();
  const open = bundles
    .filter((b) => b.open > 0)
    .sort((a, b) => b.open - a.open);
  const questions = ps.filter(
    (p) => p.state === "offen" && (datasetMode === "working" ? !!p.question : p.question || p.confidence === "pruefen"),
  );
  const done = bundles.filter((b) => b.proposals.length === 0);
  const superseded = bundles
    .flatMap((b) => b.commits)
    .filter((c) => c.supersededBy).length;
  const first = open[0]?.docs.map((doc) => open[0].proposals.find((p) => p.doc === doc && p.state === 'offen')).find(Boolean);
  const tl = bundles.find((b) => b.id === "teillieferung");
  const allDone = sum.total > 0 && sum.open === 0;
  // Own projects: report what was imported and checked, never showcase routing numbers.
  const project = datasetMode === "working" ? projectState.project : null;
  const unmapped = !!project && !project.mapping;
  const documentCount = project ? new Set(project.documents.map((d) => d.path)).size : 0;
  const mismatches = project?.mapping?.mismatches ?? 0;
  // A cloned repository brings its history: its features are shown like the showcase's.
  const features = bundles.filter((b) => b.commits.length > 0);
  const history = !!project && features.length > 0;
  const checked = project
    ? [
        ...(history ? [`${plural(features.reduce((n, b) => n + b.commits.length, 0), "Commit", "Commits")} ${projectState.history?.tag ? `seit ${projectState.history.tag} ` : ""}zu ${plural(features.length, "Feature", "Features")} gebündelt`] : []),
        `${plural(project.files.length, "Code-Datei", "Code-Dateien")} und ${plural(documentCount, "Dokument", "Dokumente")} importiert`,
        ...(project.mapping ? [
          `${plural(project.mapping.subjects, "Doku-Abschnitt", "Doku-Abschnitte")} gegen den aktuellen Code geprüft`,
          `${plural(project.mapping.consistent, "Abschnitt passt", "Abschnitte passen")} zum Code`,
          ...(project.mapping.findings ? [`${plural(project.mapping.findings, "Änderung", "Änderungen")} mit Begründung und Codebeleg vorbereitet`] : []),
          ...(project.mapping.skipped ? [`${plural(project.mapping.skipped, "Abschnitt", "Abschnitte")} ohne prüfbaren Inhalt (Logos, Links), bleiben unverändert`] : []),
          ...(history && done.length ? [`${plural(done.length, "Feature", "Features")} ohne nötige Textänderung (${done.map((d) => d.title).join(", ")})`] : []),
        ] : []),
      ]
    : null;

  return (
    <Frame title="Übersicht">
      <ProjectControls />
      <Card
        className={cn(
          "gap-0 overflow-hidden border-brand-200 py-0 dark:border-brand-500/30",
          allDone && "border-emerald-200 dark:border-emerald-500/30",
        )}
      >
        {allDone ? (
          <div className="flex items-start gap-4 bg-emerald-50/60 p-6 dark:bg-emerald-500/10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-5" />
            </span>
            <div className="grid gap-2">
              <span className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
                {project ? "Eigenes Projekt" : `Release ${release.id}`} · Prüfung abgeschlossen
              </span>
              <p className="text-[26px] leading-tight font-medium tracking-tight">
                {sum.total === 1 ? "Der Vorschlag ist entschieden." : `Alle ${sum.total} Vorschläge sind entschieden.`}
              </p>
              <p className="max-w-[64ch] text-sm text-muted-foreground">
                {project
                  ? "„Freigaben exportieren“ lädt die korrigierten Dokumente als ZIP herunter. Deine Originaldateien bleiben unverändert."
                  : <>Die Vorschläge für {plural(sum.docsTouched, "Dokument", "Dokumente")}{" "}
                    sind übernommen oder verworfen. Um von vorn zu beginnen, setz die
                    Entscheidungen oben rechts zurück.</>}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 bg-brand-50/60 p-6 md:grid-cols-[1fr_auto] md:items-center dark:bg-brand-500/10">
            <div className="grid gap-2">
              <span className="text-xs font-medium tracking-wide text-brand-700 uppercase dark:text-brand-300">
                {history ? `${release.id.startsWith("seit") ? `Änderungen ${release.id}` : `Release ${release.id}`} · Stand ${fmtDate(release.freeze)}` : datasetMode === 'working' ? `Eigenes Projekt · importiert am ${fmtDate(release.freeze)}` : `Release ${release.id} · Code-Freeze am ${fmtDate(release.freeze)}`}
              </span>
              <p className="text-[26px] leading-tight font-medium tracking-tight">
                {project && (unmapped || !history) ? (unmapped ? "Doku noch nicht geprüft." : mismatches ? `${plural(mismatches, "Doku-Abschnitt weicht", "Doku-Abschnitte weichen")} vom Code ab.` : "Keine Abweichung gefunden.") : (history ? features.filter((b) => b.proposals.length).length : sum.withDocs) ? <>Bei {plural(history ? features.filter((b) => b.proposals.length).length : sum.withDocs, "Feature", "Features")} muss die Doku angepasst werden.</> : "Keine Abweichung gefunden."}
              </p>
              <p className="max-w-[64ch] text-sm text-muted-foreground">
                {project && (unmapped || !history)
                  ? unmapped
                    ? "Die Erstprüfung vergleicht jedes Dokument mit dem aktuellen Code, als wäre das letzte Release gerade fertig, und zeigt jede Abweichung."
                    : mismatches
                      ? "Zu jeder Abweichung steht die Korrektur mit Begründung und Codebeleg bereit. Du prüfst jede Stelle und gibst sie frei."
                      : "Die Prüfung hat keine Abweichung zwischen Doku und Code gefunden."
                  : <>neuraldoc hat {plural(history ? features.reduce((n, b) => n + b.commits.length, 0) : sum.commits, "Commit", "Commits")} zu{" "}
                    {plural(history ? features.length : sum.bundles, "Feature", "Features")} gebündelt. „Starten“ formuliert die
                    Vorschläge für die betroffenen Dokumente.</>}
              </p>
            </div>
            {unmapped ? <StartCheck /> : <div className="grid justify-items-start gap-3 md:justify-items-end">
              <span className="flex items-baseline gap-2">
                <strong className="text-5xl font-medium tracking-tight tabular-nums">
                  {sum.open}
                </strong>
                <span className="text-sm text-muted-foreground">
                  {sum.open === 1 ? "offener Vorschlag" : "offene Vorschläge"}
                </span>
              </span>
              <StartReview proposals={ps} first={first} label='Starten' />
            </div>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Doku-Änderungen prüfen</CardTitle>
            <CardDescription>
              {allDone
                ? "Zu diesen Features sind alle Vorschläge entschieden."
                : project && !history
                  ? "Abweichungen zwischen Doku und aktuellem Code."
                  : "Features mit den meisten offenen Vorschlägen zuerst."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {project && !allDone && open.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {unmapped ? "Nach der Erstprüfung stehen hier die Abweichungen." : "Keine offenen Abweichungen."}
              </p>
            )}
            {allDone && (
              <ul className="grid gap-2 text-sm">
                {bundles
                  .filter((b) => b.proposals.length > 0)
                  .map((b) => (
                    <li key={b.id}>
                      <Link
                        to="/aenderungen/$id"
                        params={{ id: b.id }}
                        className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 transition-colors hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                      >
                        <Check className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                        <span className="font-medium">{b.title}</span>
                        <span className="text-muted-foreground">
                          {plural(
                            b.proposals.length,
                            "Vorschlag",
                            "Vorschläge",
                          )}{" "}
                          entschieden
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
            {open.map((b, i) => {
              const minutes = Math.max(
                1,
                Math.round(b.open * (b.nature === "umbenennung" ? 0.2 : 1.2)),
              );
              return (
                <Link
                  key={b.id}
                  to="/aenderungen/$id"
                  params={{ id: b.id }}
                  className="group grid grid-cols-[auto_1fr_auto] items-start gap-4 rounded-xl border p-4 transition-colors hover:border-brand-300"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-medium text-white">
                    {i + 1}
                  </span>
                  <span className="grid gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.title}</span>
                      <NatureBadge nature={b.nature} />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plural(b.open, "offener Vorschlag", "offene Vorschläge")} in{" "}
                      {plural(b.types.length, "Doku-Art", "Doku-Arten")}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {b.types.map((t) => {
                        const Icon = typeIcon[t];
                        return (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="gap-1 font-normal"
                          >
                            <Icon /> {docTypes[t].label}
                          </Badge>
                        );
                      })}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
                    <Clock className="size-3.5" />{" "}
                    {b.nature === "umbenennung"
                      ? "Umbenennung"
                      : `ca. ${minutes} Min.`}
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
            {questions.length > 0 && (
              <div className="grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-late/30 bg-late-soft p-4">
                <CircleHelp className="mt-0.5 size-5 text-late-fg" />
                <span className="grid gap-1">
                  <span className="font-medium">
                    {plural(questions.length, "offene Rückfrage", "offene Rückfragen")}
                  </span>
                  {questions.map((q) => (
                    <span key={q.id} className="text-sm">
                      {q.question ?? q.why}{" "}
                      <span className="text-muted-foreground">
                        ({docOf(q.doc).title})
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Bereits geprüft</CardTitle>
            <CardDescription>Was neuraldoc schon erledigt hat.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 text-sm">
              {(checked ?? [
                `${plural(sum.commits, "Commit", "Commits")} zu ${plural(sum.bundles, "Feature", "Features")} zusammengefasst`,
                `${plural(superseded, "überholten Zwischenstand", "überholte Zwischenstände")} bei den Vorschlägen ausgelassen`,
                `${plural(sum.skipped, "Doku-Prüfung", "Doku-Prüfungen")} übersprungen, weil die Änderung die Leser nicht betrifft`,
                `${plural(done.length, "Feature", "Features")} ohne nötige Textänderung (${done.map((d) => d.title).join(", ")})`,
                ...(tl ? [`Teillieferung im Ablauf zugeordnet: ${tl.path.slice(-2).join(" › ")}`, `Vorschläge zur Teillieferung für ${plural(routing(tl).filter((r) => r.status === "vorschlaege").length, "Doku-Art", "Doku-Arten")} vorbereitet`] : []),
              ]).map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      blueSoft,
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </Frame>
  );
}
