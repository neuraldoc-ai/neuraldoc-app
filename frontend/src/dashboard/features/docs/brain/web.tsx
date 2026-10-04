import { useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  StraightEdge,
  type EdgeProps,
  useViewport,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import {
  ArrowLeft,
  PanelRightClose,
  PanelRightOpen,
  Route,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Main } from "@/components/layout/main";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/context/theme-provider";
import { cn } from "@/lib/utils";
import { EdgeDetail, MappingStatus, NodeDetail } from "./common";
import { typeIcon } from "./icons";
import {
  brain,
  edgeLabel,
  nodeById,
  nodeOrder,
  overviewTypes,
  typeLabel,
  type BrainEdge,
  type BrainNode,
  type NodeType,
} from "./model";
import { distances, projectConnections, shortestPath } from "./graph-utils.mjs";

type Path = { nodes: string[]; edges: BrainEdge[] };
type Data = {
  node: BrainNode;
  selected: boolean;
  dim: boolean;
  important: boolean;
};
const sizes: Record<NodeType, number> = {
  feature: 64,
  module: 48,
  department: 54,
  database: 56,
  doc: 34,
  commit: 24,
  ticket: 32,
  file: 30,
  function: 28,
  parameter: 26,
  table: 38,
  view: 34,
  column: 22,
  person: 30,
};
const CENTER =
  "!top-[38px] !left-1/2 !size-px !min-h-0 !min-w-0 !-translate-x-1/2 !-translate-y-1/2 !border-0 !opacity-0";
function BrainNodeView({ data }: NodeProps<Node<Data>>) {
  const { zoom } = useViewport();
  const n = data.node,
    Icon = typeIcon[n.type],
    size = sizes[n.type];
  const showLabel = zoom > 0.55 || data.important || data.selected;
  return (
    <div
      className={cn(
        "relative h-[112px] w-[164px] transition-opacity",
        data.dim && "opacity-20",
      )}
    >
      <Handle type="target" position={Position.Left} className={CENTER} />
      <Handle type="source" position={Position.Right} className={CENTER} />
      <Card
        className={cn(
          "absolute top-[38px] left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0 rounded-full border-2 p-0 shadow-sm",
          n.type === "feature"
            ? "border-brand-700 bg-brand-600 text-white"
            : n.type === "module" || n.type === "department"
              ? "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
              : "border-muted-foreground/50 bg-background text-foreground",
          data.selected && "ring-4 ring-brand-500/30",
        )}
        style={{ width: size, height: size }}
      >
        <Icon
          style={{
            width: Math.max(12, size * 0.36),
            height: Math.max(12, size * 0.36),
          }}
        />
      </Card>
      {showLabel && (
        <div className="absolute top-[76px] left-1/2 w-[164px] -translate-x-1/2 text-center">
          <span
            className={cn(
              "line-clamp-2 rounded bg-background/90 px-1 text-[13px] leading-tight break-words",
              n.type === "feature" && "text-[15px] font-semibold",
            )}
          >
            {n.label}
          </span>
          {data.selected && (
            <span className="block text-[10px] text-muted-foreground">
              {typeLabel[n.type]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
const nodeTypes = { brain: BrainNodeView };
function PanFriendlyEdge(props: EdgeProps) {
  return (
    <g
      ref={(element) => {
        // React Flow always blocks panning on edge wrappers, even when selection
        // is disabled. This viewer allows dragging from edges as well as nodes.
        element?.parentElement?.classList.remove("nopan");
      }}
    >
      <StraightEdge {...props} />
    </g>
  );
}
const edgeTypes = { "pan-friendly": PanFriendlyEdge };
type Sim = SimulationNodeDatum & { id: string; type: NodeType };
function layout(
  nodes: BrainNode[],
  edges: { source: string; target: string }[],
) {
  const sim: Sim[] = nodes.map((n) => ({ id: n.id, type: n.type }));
  const links = edges.map((e) => ({ ...e }));
  forceSimulation(sim)
    .force(
      "link",
      forceLink<Sim, (typeof links)[number]>(links)
        .id((n) => n.id)
        .distance(190)
        .strength(0.24),
    )
    .force("charge", forceManyBody().strength(-430))
    .force(
      "collision",
      forceCollide<Sim>()
        .radius((n) => (n.type === "feature" ? 108 : 90))
        .iterations(3),
    )
    .force("x", forceX(0).strength(0.018))
    .force("y", forceY(0).strength(0.035))
    .force("center", forceCenter(0, 0))
    .stop()
    .tick(300);
  return Object.fromEntries(
    sim.map((n) => [n.id, { x: (n.x || 0) - 82, y: (n.y || 0) - 38 }]),
  );
}

export function BrainWeb() {
  const { resolvedTheme } = useTheme();
  const canvas = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState("overview"),
    [scope, setScope] = useState("all");
  const [root, setRoot] = useState(brain.nodes.find((n) => n.type === "feature")?.id || brain.nodes[0]?.id || ""),
    [depth, setDepth] = useState("2");
  const [types, setTypes] = useState<NodeType[]>(nodeOrder),
    [onlyProven, setOnlyProven] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [edge, setEdge] = useState<BrainEdge | null>(null),
    [path, setPath] = useState<Path | null>(null);
  const [history, setHistory] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const [traceOpen, setTraceOpen] = useState(false),
    [target, setTarget] = useState("a:Buchhaltung"),
    [targetQuery, setTargetQuery] = useState(""),
    [noPath, setNoPath] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [measured, setMeasured] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const allowed = useMemo(
    () => brain.edges.filter((e) => !onlyProven || e.certainty === "belegt"),
    [onlyProven],
  );
  const near = useMemo(
    () => distances(allowed, root, depth === "all" ? Infinity : Number(depth)),
    [allowed, root, depth],
  );
  const shownNodes = useMemo(
    () =>
      brain.nodes.filter(
        (n) =>
          ((scope === "all" || near.has(n.id)) &&
            (mode === "overview" ? overviewTypes : types).includes(n.type)) ||
          (scope === "focus" && n.id === root) ||
          !!path?.nodes.includes(n.id),
      ),
    [scope, near, mode, types, root, path],
  );
  const ids = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes]);
  const connections = useMemo(
    () =>
      mode === "overview"
        ? projectConnections(allowed, [...ids], 5)
        : allowed
            .filter((e) => ids.has(e.source) && ids.has(e.target))
            .map((e) => ({
              source: e.source,
              target: e.target,
              nodes: [e.source, e.target],
              edges: [e],
            })),
    [mode, allowed, ids],
  );
  const positions = useMemo(
    () => layout(shownNodes, connections),
    [shownNodes, connections],
  );
  const focusId = selected;
  const lit = new Set<string>(
    path?.nodes ||
      (focusId
        ? [
            focusId,
            ...connections
              .filter((e) => e.source === focusId || e.target === focusId)
              .flatMap((e) => [e.source, e.target]),
          ]
        : []),
  );
  const nodes: Node<Data>[] = shownNodes.map((n) => ({
    id: n.id,
    type: "brain",
    position: positions[n.id],
    measured: measured[n.id],
    ariaLabel: `${typeLabel[n.type]}: ${n.label}`,
    data: {
      node: n,
      selected: n.id === selected,
      dim: lit.size > 0 && !lit.has(n.id),
      important:
        n.id === focusId ||
        ["feature", "module", "department", "database"].includes(n.type),
    },
  }));
  const edges: Edge[] = connections.map((p, i) => {
    const highlighted = path
      ? p.edges.some((e) => path.edges.some((step) => step.id === e.id))
      : !!focusId && (p.source === focusId || p.target === focusId);
    return {
      id: `line:${i}`,
      source: p.source,
      target: p.target,
      type: "pan-friendly",
      label:
        highlighted && p.edges.length === 1
          ? edgeLabel[p.edges[0].kind]
          : undefined,
      labelStyle: { fontSize: 11 },
      labelBgStyle: { fill: "var(--background)" },
      style: {
        stroke: highlighted ? "var(--brand-600)" : "var(--muted-foreground)",
        strokeWidth: highlighted ? 2.2 : 1,
        opacity: lit.size && !highlighted ? 0.1 : highlighted ? 1 : 0.32,
        strokeDasharray: p.edges.some((e) => e.certainty !== "belegt")
          ? "5 5"
          : undefined,
      },
      data: { path: p },
    };
  });
  const query = search.trim().toLocaleLowerCase("de-DE");
  const matches = query
    ? brain.nodes.filter((n) =>
        `${n.label} ${n.sub} ${n.evidence?.map((e) => e.source).join(" ")}`
          .toLocaleLowerCase("de-DE")
          .includes(query),
      )
    : [];
  function focus(id: string) {
    if (root !== id) setHistory((h) => [...h, root]);
    setRoot(id);
    setScope("focus");
    setMode("detail");
    setSelected(id);
    setDetailsOpen(true);
    setEdge(null);
    setPath(null);
    setSearch("");
  }
  function selectNode(id: string) {
    setSelected(id);
    setEdge(null);
    setDetailsOpen(true);
  }
  function onChange(changes: NodeChange<Node<Data>>[]) {
    // Retain measurements when selecting objects or changing the sidebar.
    const dimensions = changes.filter((c) => c.type === "dimensions");
    if (dimensions.length)
      setMeasured((current) => {
        const next = { ...current };
        for (const c of dimensions) if (c.dimensions) next[c.id] = c.dimensions;
        return next;
      });
  }
  const viewportKey = `${mode}:${scope}:${root}:${depth}:${onlyProven}:${types.join(",")}:${path?.nodes.join(",") || ""}`;
  return (
    <>
      <AppHeader crumbs={[{ label: "Company Brain" }]} />
      <Main
        fixed
        fluid
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-semibold tracking-tight">
            Company Brain
          </h1>
          <div className="relative min-w-[200px] flex-1 lg:max-w-sm">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Netz durchsuchen"
              placeholder="Feature, Commit, Funktion oder Tabelle …"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {query && (
              <Card className="absolute top-11 left-0 z-30 max-h-80 w-full gap-1 overflow-auto p-2">
                <span className="px-2 py-1 text-xs text-muted-foreground">
                  {matches.length} Treffer
                </span>
                {matches.map((n) => (
                  <Button
                    key={n.id}
                    variant="ghost"
                    className="h-auto justify-start gap-2 py-2 text-left whitespace-normal"
                    onClick={() => focus(n.id)}
                  >
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {typeLabel[n.type]}
                    </Badge>
                    <span className="text-xs">{n.label}</span>
                  </Button>
                ))}
              </Card>
            )}
          </div>
          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v);
              setPath(null);
              setEdge(null);
            }}
          >
            <SelectTrigger className="w-[145px]" aria-label="Detailgrad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">Überblick</SelectItem>
              <SelectItem value="detail">Alle Objekttypen</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={scope}
            onValueChange={(v) => {
              setScope(v);
            }}
          >
            <SelectTrigger className="w-[155px]" aria-label="Netzausschnitt">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Gesamtes Netz</SelectItem>
              <SelectItem value="focus">Um Mittelpunkt</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Netz filtern">
                <SlidersHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="brain-proven">Nur belegte Beziehungen</Label>
                <Switch
                  id="brain-proven"
                  checked={onlyProven}
                  onCheckedChange={(v) => {
                    setOnlyProven(v);
                    setPath(null);
                    setEdge(null);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>Verbindungstiefe</Label>
                <Select value={depth} onValueChange={setDepth}>
                  <SelectTrigger aria-label="Verbindungstiefe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "5", "all"].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d === "all" ? "Alle erreichbaren" : `${d} Schritte`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ToggleGroup
                type="multiple"
                variant="outline"
                size="sm"
                value={types}
                onValueChange={(v) => {
                  setTypes(v as NodeType[]);
                  setMode("detail");
                }}
                className="flex flex-wrap justify-start"
              >
                {nodeOrder.map((type) => (
                  <ToggleGroupItem
                    key={type}
                    value={type}
                    className="px-2 text-[11px]"
                  >
                    {typeLabel[type]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            aria-label="Verbindungspfad suchen"
            onClick={() => setTraceOpen(true)}
          >
            <Route />
          </Button>
        </div>
        <MappingStatus onSelect={selectNode} />
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border bg-background">
          {(selected || edge) && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-30 size-8 bg-background/95"
              aria-label={
                detailsOpen
                  ? "Detail-Sidebar einklappen"
                  : "Detail-Sidebar ausklappen"
              }
              title={detailsOpen ? "Details einklappen" : "Details ausklappen"}
              aria-expanded={detailsOpen}
              aria-controls="brain-detail-sidebar"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          )}
          <div
            ref={canvas}
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          >
            <ReactFlow
              key={viewportKey}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              colorMode={resolvedTheme}
              onNodesChange={onChange}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
              selectNodesOnDrag={false}
              selectionOnDrag={false}
              selectionKeyCode={null}
              panOnDrag
              zoomOnDoubleClick={false}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.14 }}
              minZoom={0.08}
              maxZoom={3}
              onNodeDoubleClick={(_, n) => selectNode(n.id)}
              onEdgeClick={() => {
                /* Keep edge hit areas active without selecting on click. */
              }}
              onEdgeDoubleClick={(_, e) => {
                setDetailsOpen(true);
                const p = e.data?.path as Path;
                if (p.edges.length === 1) {
                  setEdge(p.edges[0]);
                  setSelected(null);
                } else {
                  setPath(p);
                  setMode("detail");
                  setEdge(p.edges[0]);
                  setSelected(null);
                }
              }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1}
                color="var(--border)"
              />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
            <div className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-4rem)] flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="pointer-events-auto border bg-background/95 px-3 py-2 shadow-sm"
              >
                {shownNodes.length} Objekte · {connections.length} Verbindungen
              </Badge>
              {scope === "focus" && (
                <Badge
                  variant="secondary"
                  className="max-w-sm truncate border bg-background/95 px-3 py-2"
                >
                  Mittelpunkt: {nodeById[root].label}
                </Badge>
              )}
              {!!history.length && (
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto bg-background"
                  onClick={() => {
                    const id = history.at(-1)!;
                    setHistory((h) => h.slice(0, -1));
                    setRoot(id);
                    setSelected(id);
                    setDetailsOpen(true);
                    setPath(null);
                  }}
                >
                  <ArrowLeft /> Zurück
                </Button>
              )}
              {path && (
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto bg-background"
                  onClick={() => {
                    setPath(null);
                    setEdge(null);
                  }}
                >
                  <X /> Pfad zurücksetzen
                </Button>
              )}
            </div>
            <div className="pointer-events-none absolute right-3 bottom-4 left-14 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="rounded bg-background/90 px-2 py-1">
                Doppelklick zum Erkunden · Ziehen zum Anordnen
              </span>
              <span className="rounded bg-background/90 px-2 py-1">
                ━━ Belegt · ┄┄ Abgeleitet / zugeordnet
              </span>
            </div>
          </div>
          <aside
            id="brain-detail-sidebar"
            aria-label="Details zum Company Brain"
            hidden={!detailsOpen}
            className={cn(
              "absolute inset-y-0 right-0 z-20 w-[360px] max-w-full flex-col border-l bg-background shadow-lg md:static md:shrink-0 md:shadow-none",
              detailsOpen ? "flex" : "hidden",
            )}
          >
            <div className="flex h-14 shrink-0 items-center border-b px-4 pr-14">
              <h2 className="text-sm font-medium">Details</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {edge ? (
                <EdgeDetail edge={edge} onSelect={selectNode} />
              ) : selected ? (
                <NodeDetail
                  id={selected}
                  onlyProven={onlyProven}
                  onSelect={selectNode}
                  onFocus={focus}
                />
              ) : (
                <p className="p-5 text-sm text-muted-foreground">
                  Wähle ein Objekt oder eine Verbindung im Netz aus.
                </p>
              )}
              {path && (
                <div className="grid gap-2 border-t p-4">
                  <h3 className="text-xs font-medium">Verbindungspfad</h3>
                  {path.nodes.map((id, i) => (
                    <div key={id}>
                      <Button
                        variant="ghost"
                        className="h-auto justify-start text-left text-xs whitespace-normal"
                        onClick={() => selectNode(id)}
                      >
                        {nodeById[id].label}
                      </Button>
                      {path.edges[i] && (
                        <Button
                          variant="link"
                          className="h-auto justify-start px-3 py-1 text-[11px]"
                          onClick={() => {
                            setSelected(null);
                            setEdge(path.edges[i]);
                          }}
                        >
                          {edgeLabel[path.edges[i].kind]}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </Main>
      <Dialog open={traceOpen} onOpenChange={setTraceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verbindung verfolgen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Von {nodeById[root].label}
          </p>
          <Input
            aria-label="Pfadziel suchen"
            placeholder="Ziel suchen …"
            value={targetQuery}
            onChange={(e) => setTargetQuery(e.target.value)}
          />
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger aria-label="Pfadziel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brain.nodes
                .filter((n) =>
                  n.label.toLowerCase().includes(targetQuery.toLowerCase()),
                )
                .map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {typeLabel[n.type]} · {n.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              const p = shortestPath(allowed, root, target);
              if (!p) {
                setNoPath(true);
                return;
              }
              setPath(p);
              setMode("detail");
              setScope("focus");
              setSelected(target);
              setDetailsOpen(true);
              setEdge(null);
              setTraceOpen(false);
              setNoPath(false);
            }}
          >
            Im Netz zeigen
          </Button>
          {noPath && (
            <p role="status" className="text-sm text-muted-foreground">
              Im gewählten Filter ist kein Pfad erfasst.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
