/**
 * The document editor: proposals sit inside the text like suggestions in Word.
 * Each one can be accepted, rejected — or changed in place first, sentence, chapter or table row.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Pencil,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { people, type Block } from "./data";
import { EvidenceCard } from "./evidence";
import {
  bundleOf,
  docOf,
  finalBlocks,
  finalRows,
  finalText,
  fmtDate,
  inDocumentOrder,
  nextOpenDoc,
  plural,
  useProposals,
  type LiveProposal,
  type PState,
} from "./model";
import { useDecisions } from "./store";
import {
  ConfidenceBadge,
  DocTypeBadge,
  Frame,
  Hash,
  Person,
  SizeBadge,
  StateBadge,
} from "./ui";
import { locationOf } from "./logic";
import { GenerateText } from './generate-text';
import { ProposalQuestion } from './proposal-question';

export function EditorPage({ id, focus }: { id: string; focus?: string }) {
  const doc = docOf(id);
  // In document order, see inDocumentOrder.
  const all = useProposals();
  const ps = inDocumentOrder(all.filter((p) => p.doc === id));
  // A document always opens on its topmost open place, whichever place linked here.
  const start = ps.find((p) => p.state === "offen")?.id ?? focus;
  const [active, setActive] = useState<string | undefined>(start);
  // The evidence card keeps showing the last selected proposal when a click elsewhere clears the selection.
  const [last, setLast] = useState<string | undefined>(start);
  if (active && active !== last) setLast(active);
  const shown =
    ps.find((p) => p.id === (active ?? last)) ??
    ps.find((p) => p.state === "offen") ??
    ps[0];
  const [editing, setEditing] = useState<string | undefined>();
  const decideMany = useDecisions((s) => s.decideMany);

  // Jump between open places, like next/previous change in a code review.
  const openIds = ps.filter((p) => p.state === "offen").map((p) => p.id);
  const jump = (delta: 1 | -1) => {
    if (!openIds.length) return;
    const pos = active ? openIds.indexOf(active) : -1;
    // Nothing selected: continue from what is on screen, not from the top.
    const top = (i: string) =>
      document.getElementById(`s-${i}`)?.getBoundingClientRect().top ?? 0;
    const fromView =
      delta > 0
        ? openIds.findIndex((i) => top(i) > 160)
        : openIds.findLastIndex((i) => top(i) < 160);
    const next =
      pos === -1
        ? fromView === -1
          ? delta > 0
            ? openIds.length - 1
            : 0
          : fromView
        : Math.min(openIds.length - 1, Math.max(0, pos + delta));
    setEditing(undefined);
    setActive(openIds[next]);
    setTimeout(
      () =>
        document
          .getElementById(`s-${openIds[next]}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      30,
    );
  };
  // After a decision, glide to the place that followed it (undo adds a place back and stays put).
  const prevOpen = useRef(openIds);
  const openKey = openIds.join();
  useEffect(() => {
    const before = prevOpen.current;
    prevOpen.current = openIds;
    if (openIds.length >= before.length || !openIds.length) return;
    const at = before.findIndex((x) => !openIds.includes(x));
    const next = openIds[Math.min(at, openIds.length - 1)];
    setEditing(undefined);
    setActive(next);
    const t = setTimeout(
      () =>
        document
          .getElementById(`s-${next}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      60,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  // Alt+↓ / F7 = next place, Alt+↑ / Shift+F7 = previous place (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input, textarea, [contenteditable=true], [role=dialog]",
        )
      )
        return;
      const down =
        (e.altKey && e.key === "ArrowDown") || (e.key === "F7" && !e.shiftKey);
      const up =
        (e.altKey && e.key === "ArrowUp") || (e.key === "F7" && e.shiftKey);
      if (!down && !up) return;
      e.preventDefault();
      jump(down ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!start) return;
    const t = setTimeout(
      () =>
        document
          .getElementById(`s-${start}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      80,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!doc)
    return <Frame title="Nicht gefunden">Dieses Dokument gibt es nicht.</Frame>;

  const open = ps.filter((p) => p.state === "offen");
  const sure = open.filter((p) => p.confidence === "hoch");
  const ctx: Ctx = { active, setActive, editing, setEditing };
  const at = (i: number, ops: LiveProposal["op"][]) =>
    ps.filter((p) => p.at === i && ops.includes(p.op));

  return (
    <Frame
      title={doc.title}
      crumbs={[
        { label: "Daten", to: "/daten" },
        { label: "Dokumente", to: "/dokumente" },
        { label: doc.title },
      ]}
      lead={
        doc.planned
          ? "Gibt es noch nicht. Erste Fassung von neuraldoc."
          : undefined
      }
      actions={
        sure.length > 1 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              decideMany(
                sure.map((p) => p.id),
                "uebernommen",
                `${doc.title}: ${sure.length} sichere Vorschläge übernommen`,
              )
            }
          >
            <CheckCheck /> {sure.length} sichere übernehmen
          </Button>
        ) : null
      }
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-0 py-0">
          <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b bg-card/95 px-6 py-2.5 backdrop-blur sm:px-10">
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <DocTypeBadge type={doc.type} />
              {doc.planned
                ? "Entwurf"
                : `Version ${doc.version} · ${fmtDate(doc.updated)}`}
              <Person id={doc.owner} className="text-xs" />
            </span>
            <ChangeNav
              position={active ? openIds.indexOf(active) : -1}
              total={openIds.length}
              onPrev={() => jump(-1)}
              onNext={() => jump(1)}
              next={nextOpenDoc(all, id)}
            />
          </div>
          <article className="mx-auto grid w-full max-w-[74ch] gap-4 px-6 py-8 text-[15px] leading-7 sm:px-10">
            {at(-1, ["insert", "note"]).map((p) => (
              <InsertSuggestion key={p.id} p={p} ctx={ctx} />
            ))}
            {doc.blocks.map((block, i) => (
              <Fragment key={i}>
                <BlockView
                  block={block}
                  replaces={at(i, ["replace"])}
                  rows={at(i, ["rows"])}
                  ctx={ctx}
                />
                {at(i, ["insert", "note"]).map((p) => (
                  <InsertSuggestion key={p.id} p={p} ctx={ctx} />
                ))}
              </Fragment>
            ))}
          </article>
        </Card>
        <aside className="grid content-start gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain">
          <SidePanel ps={ps} ctx={ctx} />
          <EvidenceCard p={shown} />
        </aside>
      </div>
    </Frame>
  );
}

type Ctx = {
  active?: string;
  setActive: (id?: string) => void;
  editing?: string;
  setEditing: (id?: string) => void;
};

/* ---------- Blocks with inline replacements ---------- */

type Seg = string | LiveProposal;

function segments(text: string, replaces: LiveProposal[], all: boolean): Seg[] {
  let segs: Seg[] = [text];
  for (const r of replaces) {
    if (!r.find) continue;
    segs = segs.flatMap((s) => {
      if (typeof s !== "string" || !s.includes(r.find!)) return [s];
      const parts = s.split(r.find!);
      if (!all) return [parts[0], r, parts.slice(1).join(r.find!)];
      return parts.flatMap((part, k) => (k === 0 ? [part] : [r, part]));
    });
  }
  return segs.filter((s) => s !== "");
}

function Inline({
  text,
  replaces,
  ctx,
  all,
}: {
  text: string;
  replaces: LiveProposal[];
  ctx: Ctx;
  all?: boolean;
}) {
  return (
    <>
      {segments(text, replaces, !!all).map((s, k) =>
        typeof s === "string" ? (
          <Fragment key={k}>{s}</Fragment>
        ) : (
          <ReplaceMark key={k} p={s} ctx={ctx} />
        ),
      )}
    </>
  );
}

function BlockView({
  block,
  replaces,
  rows,
  ctx,
}: {
  block: Block;
  replaces: LiveProposal[];
  rows: LiveProposal[];
  ctx: Ctx;
}) {
  const editingReplace = replaces.find((r) => r.id === ctx.editing);
  if (block.kind === "h")
    return (
      <h2 className="mt-4 text-xl font-medium tracking-tight first:mt-0">
        <Inline text={block.text} replaces={replaces} ctx={ctx} />
      </h2>
    );
  if (block.kind === "p")
    return (
      <div className="grid gap-2">
        <p className="whitespace-pre-line">
          <Inline text={block.text} replaces={replaces} ctx={ctx} />
        </p>
        {editingReplace && <ReplaceEditor p={editingReplace} ctx={ctx} />}
      </div>
    );
  if (block.kind === "figure") return <Figure caption={block.caption} />;
  return (
    <TableBlock
      block={block}
      replaces={replaces}
      rows={rows}
      ctx={ctx}
      editingReplace={editingReplace}
    />
  );
}

/** True once a proposal has just been decided in this view, so the change can play a short animation. */
function useJustDecided(state: PState) {
  const [prev, setPrev] = useState(state);
  const [fresh, setFresh] = useState(false);
  if (prev !== state) {
    setPrev(state);
    setFresh(prev === "offen" && state !== "offen");
  }
  return fresh;
}

/** Same colors as a git diff: red = goes, green = comes. */
const diffDel =
  "rounded-sm bg-red-500/15 px-0.5 text-red-700 line-through decoration-1 dark:text-red-300";
const diffAdd =
  "rounded-sm bg-emerald-500/15 px-0.5 text-emerald-800 no-underline dark:text-emerald-200";

/** A replacement inside running text, diff style: removed words red and struck, added words green — click for actions. */
function ReplaceMark({ p, ctx }: { p: LiveProposal; ctx: Ctx }) {
  const decide = useDecisions((s) => s.decide);
  const fresh = useJustDecided(p.state);
  if (p.state === "verworfen") return <>{p.find}</>;
  if (p.state !== "offen")
    return (
      <>
        <span
          className={cn("rounded-sm bg-muted px-0.5", fresh && "nd-keep")}
          title={
            p.state === "angepasst"
              ? "Von Ihnen angepasst übernommen"
              : "Übernommen"
          }
        >
          {finalText(p)}
        </span>
      </>
    );
  const isActive = ctx.active === p.id;
  const isEditing = ctx.editing === p.id;
  return (
    <Popover
      open={isActive && !isEditing}
      onOpenChange={(o) => ctx.setActive(o ? p.id : undefined)}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          id={`s-${p.id}`}
          onClick={() => ctx.setActive(p.id)}
          className={cn(
            "scroll-mt-24 rounded-sm text-left transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/10",
            isActive &&
              "bg-brand-50 ring-2 ring-brand-200 dark:bg-brand-500/15 dark:ring-brand-500/30",
          )}
        >
          <del className={diffDel}>{p.find}</del>
          <ins
            className={cn(
              diffAdd,
              p.confidence === "pruefen" &&
                "underline decoration-late decoration-wavy decoration-1 underline-offset-4",
            )}
          >
            {p.text}
          </ins>
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[420px] max-w-[calc(100vw-2rem)]"
      >
        <SuggestionHeader p={p} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={p.generation?.status === "needs_context" || !!p.question}
            onClick={() =>
              decide(p.id, { state: "uebernommen" }, `Übernommen: ${p.title}`)
            }
          >
            <Check /> Übernehmen
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => ctx.setEditing(p.id)}
          >
            <Pencil /> Ändern
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              decide(p.id, { state: "verworfen" }, `Verworfen: ${p.title}`)
            }
          >
            <X /> Verwerfen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReplaceEditor({ p, ctx }: { p: LiveProposal; ctx: Ctx }) {
  const decide = useDecisions((s) => s.decide);
  const [text, setText] = useState(p.text ?? "");
  return (
    <EditFrame
      p={p}
      onSave={() => {
        decide(
          p.id,
          {
            state: "uebernommen",
            edited: text !== p.text ? { text } : undefined,
          },
          `${text !== p.text ? "Angepasst übernommen" : "Übernommen"}: ${p.title}`,
        );
        ctx.setEditing(undefined);
      }}
      onCancel={() => ctx.setEditing(undefined)}
    >
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(2, Math.ceil(text.length / 80))}
        className="text-[15px] leading-7"
      />
    </EditFrame>
  );
}

/* ---------- Tables with new rows ---------- */

function TableBlock({
  block,
  replaces,
  rows,
  ctx,
  editingReplace,
}: {
  block: Extract<Block, { kind: "table" }>;
  replaces: LiveProposal[];
  rows: LiveProposal[];
  ctx: Ctx;
  editingReplace?: LiveProposal;
}) {
  const editingRows = rows.find((r) => r.id === ctx.editing);
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table className="text-[13px] leading-normal">
          <TableHeader>
            <TableRow className="bg-muted/40">
              {block.head.map((h) => (
                <TableHead key={h} className="h-9">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell
                    key={j}
                    className={cn(
                      "py-2 whitespace-normal",
                      j === 0 && "font-mono text-[12px]",
                    )}
                  >
                    <Inline text={c} replaces={replaces} ctx={ctx} all />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.map((p) =>
              p.state === "verworfen" ? null : p.id === editingRows?.id ? (
                <RowsEditor
                  key={p.id}
                  p={p}
                  width={block.head.length}
                  ctx={ctx}
                />
              ) : (
                finalRows(p).map((r, k) => (
                  <TableRow
                    key={`${p.id}-${k}`}
                    id={k === 0 ? `s-${p.id}` : undefined}
                    onClick={() => p.state === "offen" && ctx.setActive(p.id)}
                    className={cn(
                      "scroll-mt-24",
                      p.state === "offen"
                        ? "cursor-pointer bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-500/10"
                        : "bg-muted/20",
                      ctx.active === p.id &&
                        "ring-2 ring-brand-200 ring-inset dark:ring-brand-500/30",
                    )}
                  >
                    {r.map((c, j) => (
                      <TableCell
                        key={j}
                        className={cn(
                          "py-2 whitespace-normal",
                          j === 0 && "font-mono text-[12px]",
                          j === 0 &&
                            p.state === "offen" &&
                            "underline decoration-emerald-500 decoration-wavy decoration-1 underline-offset-4",
                        )}
                      >
                        {j === 0 && p.state === "offen" && (
                          <span className="me-1 text-muted-foreground no-underline">
                            +
                          </span>
                        )}
                        {c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ),
            )}
          </TableBody>
        </Table>
      </div>
      {rows
        .filter(
          (p) =>
            p.state === "offen" &&
            p.id !== editingRows?.id &&
            ctx.active === p.id,
        )
        .map((p) => (
          <RowsBar key={p.id} p={p} ctx={ctx} />
        ))}
      {editingReplace && <ReplaceEditor p={editingReplace} ctx={ctx} />}
    </div>
  );
}

function RowsBar({ p, ctx }: { p: LiveProposal; ctx: Ctx }) {
  const decide = useDecisions((s) => s.decide);
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-3 shadow-sm">
      <SuggestionHeader p={p} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={p.generation?.status === "needs_context" || !!p.question}
            onClick={() =>
            decide(p.id, { state: "uebernommen" }, `Übernommen: ${p.title}`)
          }
        >
          <Check /> {plural(p.rows!.length, "Zeile", "Zeilen")} übernehmen
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => ctx.setEditing(p.id)}
        >
          <Pencil /> Werte ändern
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            decide(p.id, { state: "verworfen" }, `Verworfen: ${p.title}`)
          }
        >
          <X /> Verwerfen
        </Button>
      </div>
    </div>
  );
}

function RowsEditor({
  p,
  width,
  ctx,
}: {
  p: LiveProposal;
  width: number;
  ctx: Ctx;
}) {
  const decide = useDecisions((s) => s.decide);
  const [rows, setRows] = useState(() => (p.rows ?? []).map((r) => [...r]));
  const changed = JSON.stringify(rows) !== JSON.stringify(p.rows);
  const set = (i: number, j: number, v: string) =>
    setRows((rs) =>
      rs.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r)),
    );
  return (
    <>
      {rows.map((r, i) => (
        <TableRow key={i} className="bg-muted/50 hover:bg-muted/50">
          {r.map((c, j) => (
            <TableCell key={j} className="p-1">
              <Input
                value={c}
                onChange={(e) => set(i, j, e.target.value)}
                className={cn(
                  "h-8 text-[13px]",
                  j === 0 && "font-mono text-[12px]",
                )}
                aria-label={`Zeile ${i + 1}, Spalte ${j + 1}`}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={width} className="py-2">
          <span className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                decide(
                  p.id,
                  {
                    state: "uebernommen",
                    edited: changed ? { rows } : undefined,
                  },
                  `${changed ? "Angepasst übernommen" : "Übernommen"}: ${p.title}`,
                );
                ctx.setEditing(undefined);
              }}
            >
              <Check /> {changed ? "Geänderte Werte übernehmen" : "Übernehmen"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => ctx.setEditing(undefined)}
            >
              Abbrechen
            </Button>
          </span>
        </TableCell>
      </TableRow>
    </>
  );
}

/* ---------- New paragraphs, chapters and pages ---------- */

function InsertSuggestion({ p, ctx }: { p: LiveProposal; ctx: Ctx }) {
  const decide = useDecisions((s) => s.decide);
  const undo = useDecisions((s) => s.undo);
  const fresh = useJustDecided(p.state);
  if (p.state === "verworfen") return null;
  if (p.state !== "offen")
    return (
      <div
        className={cn(
          "group relative grid gap-4 border-s-2 border-brand-300 ps-4 dark:border-brand-500/40",
          fresh && "nd-keep rounded-e-lg",
        )}
      >
        <Blocks blocks={finalBlocks(p)} />
        {p.task && (
          <p className="text-xs text-muted-foreground">
            Aufgabe offen: {p.task}
          </p>
        )}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <StateBadge state={p.state} />
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => undo(p.id)}
          >
            <Undo2 className="size-3" /> zurücknehmen
          </button>
        </span>
      </div>
    );
  if (ctx.editing === p.id) return <BlocksEditor p={p} ctx={ctx} />;
  const isActive = ctx.active === p.id;
  return (
    <div
      id={`s-${p.id}`}
      onClick={() => ctx.setActive(p.id)}
      className={cn(
        "grid scroll-mt-24 gap-4 rounded-xl border border-dashed p-4 transition-colors",
        p.confidence === "pruefen"
          ? "border-late/40"
          : "border-emerald-400/60 dark:border-emerald-500/40",
        isActive
          ? "bg-emerald-50 ring-2 ring-emerald-200 dark:bg-emerald-500/15 dark:ring-emerald-500/30"
          : "bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10",
      )}
    >
      <SuggestionHeader p={p} />
      <div className="grid gap-4">
        <Blocks blocks={p.blocks ?? []} suggested />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={p.generation?.status === "needs_context" || !!p.question}
          onClick={(e) => (
            e.stopPropagation(),
            decide(p.id, { state: "uebernommen" }, `Übernommen: ${p.title}`)
          )}
        >
          <Check /> {p.question ? "Satz aufnehmen" : "Übernehmen"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => (e.stopPropagation(), ctx.setEditing(p.id))}
        >
          <Pencil /> Ändern
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => (
            e.stopPropagation(),
            decide(p.id, { state: "verworfen" }, `Verworfen: ${p.title}`)
          )}
        >
          <X /> Verwerfen
        </Button>
      </div>
    </div>
  );
}

function Blocks({
  blocks,
  suggested,
}: {
  blocks: Block[];
  suggested?: boolean;
}) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h2 key={i} className="text-xl font-medium tracking-tight">
            {b.text}
          </h2>
        ) : b.kind === "p" ? (
          <p key={i} className="whitespace-pre-line">
            {b.text}
          </p>
        ) : b.kind === "figure" ? (
          <Figure key={i} caption={b.caption} />
        ) : (
          <div
            key={i}
            className={cn(
              "overflow-x-auto rounded-lg border",
              suggested && "bg-card",
            )}
          >
            <Table className="text-[13px] leading-normal">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {b.head.map((h) => (
                    <TableHead key={h} className="h-9">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.rows.map((r, k) => (
                  <TableRow key={k}>
                    {r.map((c, j) => (
                      <TableCell key={j} className="py-2 whitespace-normal">
                        {c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ),
      )}
    </>
  );
}

function BlocksEditor({ p, ctx }: { p: LiveProposal; ctx: Ctx }) {
  const decide = useDecisions((s) => s.decide);
  const [blocks, setBlocks] = useState<Block[]>(() =>
    structuredClone(p.blocks ?? []),
  );
  const changed = JSON.stringify(blocks) !== JSON.stringify(p.blocks);
  const setText = (i: number, text: string) =>
    setBlocks((bs) =>
      bs.map((b, k) =>
        k === i && (b.kind === "h" || b.kind === "p") ? { ...b, text } : b,
      ),
    );
  const setCell = (i: number, r: number, c: number, v: string) =>
    setBlocks((bs) =>
      bs.map((b, k) =>
        k === i && b.kind === "table"
          ? {
              ...b,
              rows: b.rows.map((row, a) =>
                a === r ? row.map((x, z) => (z === c ? v : x)) : row,
              ),
            }
          : b,
      ),
    );
  return (
    <EditFrame
      p={p}
      saveLabel={changed ? "Geänderte Fassung übernehmen" : "Übernehmen"}
      onSave={() => {
        decide(
          p.id,
          { state: "uebernommen", edited: changed ? { blocks } : undefined },
          `${changed ? "Angepasst übernommen" : "Übernommen"}: ${p.title}`,
        );
        ctx.setEditing(undefined);
      }}
      onCancel={() => ctx.setEditing(undefined)}
    >
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <Input
            key={i}
            value={b.text}
            onChange={(e) => setText(i, e.target.value)}
            className="h-10 text-lg font-medium"
            aria-label="Überschrift"
          />
        ) : b.kind === "p" ? (
          <Textarea
            key={i}
            value={b.text}
            onChange={(e) => setText(i, e.target.value)}
            rows={Math.max(
              2,
              b.text.split("\n").length + Math.ceil(b.text.length / 90),
            )}
            className="text-[15px] leading-7"
            aria-label={`Absatz ${i + 1}`}
          />
        ) : b.kind === "table" ? (
          <div key={i} className="overflow-x-auto rounded-lg border">
            <Table className="text-[13px] leading-normal">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {b.head.map((h) => (
                    <TableHead key={h} className="h-9">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.rows.map((r, a) => (
                  <TableRow key={a} className="hover:bg-transparent">
                    {r.map((c, z) => (
                      <TableCell key={z} className="p-1">
                        <Input
                          value={c}
                          onChange={(e) => setCell(i, a, z, e.target.value)}
                          className="h-8 text-[13px]"
                          aria-label={`Zeile ${a + 1}, Spalte ${z + 1}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null,
      )}
    </EditFrame>
  );
}

function EditFrame({
  p,
  children,
  onSave,
  onCancel,
  saveLabel,
}: {
  p: LiveProposal;
  children: ReactNode;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  return (
    <div
      id={`s-${p.id}`}
      className="grid scroll-mt-24 gap-3 rounded-xl border-2 border-brand-300 bg-card p-4 shadow-sm dark:border-brand-500/40"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Pencil className="size-3.5" /> Vorschlag ändern: {p.title}
      </span>
      {children}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          <Check /> {saveLabel ?? "Übernehmen"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

/* ---------- Jump between places ---------- */

function ChangeNav({
  position,
  total,
  onPrev,
  onNext,
  next,
}: {
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  next?: { doc: string; proposal: string };
}) {
  if (!total)
    return (
      <span className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-300">
          <Check className="size-4" /> Alle Stellen entschieden
        </span>
        <Button asChild size="sm">
          {next ? (
            <Link
              to="/dokumente/$id"
              params={{ id: next.doc }}
              search={{ p: next.proposal }}
            >
              Weiter: {docOf(next.doc).title} <ArrowRight />
            </Link>
          ) : (
            <Link to="/">
              Alles erledigt, zur Übersicht <ArrowRight />
            </Link>
          )}
        </Button>
      </span>
    );
  return (
    <span className="flex items-center gap-2">
      <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
        <Kbd>Alt</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </span>
      <span className="flex items-center rounded-full border bg-background">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
          onClick={onPrev}
          disabled={position === 0}
          title="Vorige Stelle (Alt+↑ oder Umschalt+F7)"
        >
          <ChevronUp />
        </Button>
        <span className="min-w-24 text-center text-sm tabular-nums">
          {position >= 0
            ? `Stelle ${position + 1} von ${total}`
            : `${total} offen`}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
          onClick={onNext}
          disabled={position === total - 1}
          title="Nächste Stelle (Alt+↓ oder F7)"
        >
          <ChevronDown />
        </Button>
      </span>
    </span>
  );
}

/* ---------- Shared pieces ---------- */

function SuggestionHeader({ p }: { p: LiveProposal }) {
  const b = bundleOf(p.bundle);
  return (
    <div className="grid gap-2 text-sm">
      <span className="flex flex-wrap items-center gap-1.5">
        <SizeBadge size={p.size} />
        <ConfidenceBadge confidence={p.confidence} />
        {b && (
          <Link
            to="/aenderungen/$id"
            params={{ id: b.id }}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            aus {b.title}
          </Link>
        )}
      </span>
      <strong className="font-medium">{p.title}</strong>
      <span className="text-muted-foreground">{p.why}</span>
      <ProposalQuestion p={p} />
      {p.task && (
        <span className="text-xs">
          Aufgabe für {people[docOf(p.doc).owner].name}: {p.task}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1">
        {p.commits.map((h) => (
          <Hash key={h} hash={h} hashes={p.commits} />
        ))}
      </span>
      <GenerateText p={p} />
    </div>
  );
}

function SidePanel({ ps, ctx }: { ps: LiveProposal[]; ctx: Ctx }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const open = ps.filter((p) => p.state === "offen").length;
  const jump = (id: string) => {
    ctx.setEditing(undefined);
    ctx.setActive(id);
    document
      .getElementById(`s-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
      <Card>
        <CardHeader>
          <CollapsibleTrigger className="-m-1 flex items-center justify-between gap-2 rounded-md p-1 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            <span className="grid gap-1.5">
              <CardTitle>Vorschläge</CardTitle>
              <CardDescription>
                {ps.length
                  ? `${open} von ${ps.length} offen`
                  : "Keine Vorschläge für dieses Dokument"}
              </CardDescription>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                panelOpen && "rotate-180",
              )}
              aria-hidden
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="max-h-[min(22rem,40vh)] overflow-y-auto">
            <ItemGroup>
              {ps.map((p, i) => (
                <div key={p.id}>
                  {i > 0 && <ItemSeparator />}
                  <Item
                    size="sm"
                    className={cn(
                      "px-1",
                      ctx.active === p.id && "bg-brand-50 dark:bg-brand-500/10",
                    )}
                    asChild
                  >
                    <button
                      type="button"
                      onClick={() => jump(p.id)}
                      className="w-full text-left"
                    >
                      <ItemContent className="min-w-0">
                        <ItemTitle
                          className={cn(
                            "w-full",
                            p.state === "verworfen" &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          <span className="line-clamp-2">{p.title}</span>
                        </ItemTitle>
                        <ItemDescription className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate">{locationOf(p)}</span>
                        </ItemDescription>
                        <span className="flex flex-wrap gap-1 pt-1">
                          {p.state === "offen" ? (
                            <SizeBadge size={p.size} />
                          ) : (
                            <StateBadge state={p.state} />
                          )}
                          {p.state === "offen" &&
                            p.confidence === "pruefen" && (
                              <ConfidenceBadge confidence={p.confidence} />
                            )}
                        </span>
                      </ItemContent>
                    </button>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/** The architecture picture as it stands in the document (drawn by a person, not by neuraldoc). */
function Figure({ caption }: { caption: string }) {
  const box = "rounded-md border bg-card px-2 py-1.5 text-center text-xs";
  return (
    <figure className="grid gap-2">
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
        <div className="grid grid-cols-3 gap-2">
          <span className={box}>Desktop-Client</span>
          <span className={box}>Web-Client</span>
          <span className={box}>Fahrer-App</span>
        </div>
        <span className="text-center text-xs text-muted-foreground">↓</span>
        <span className={cn(box, "font-medium")}>Anwendungsserver</span>
        <span className="text-center text-xs text-muted-foreground">↓</span>
        <div className="grid grid-cols-4 gap-2">
          <span className={box}>tour</span>
          <span className={box}>druck</span>
          <span className={box}>fibu-export</span>
          <span className={box}>Datenbank</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <span />
          <span />
          <span className="text-center text-xs text-muted-foreground">↓</span>
          <span />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <span />
          <span />
          <span className={box}>Finanzbuchhaltung</span>
          <span />
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
