export type NodeType =
  | "feature"
  | "commit"
  | "ticket"
  | "doc"
  | "section"
  | "module"
  | "department"
  | "database"
  | "table"
  | "view"
  | "column"
  | "file"
  | "function"
  | "symbol"
  | "parameter"
  | "person";
export type Evidence = {
  source: string; text: string; line?: number; method?: string;
  decision?: { model: string; probability: number; confidence?: number; createdAt: string; fingerprint: string; question?: string; alternatives: Record<string, number>; truncated?: boolean; omittedCandidates?: number; verdict?: "contradicts" | "incomplete" | "consistent" };
};
export type BrainNode = {
  id: string;
  type: NodeType;
  label: string;
  sub: string;
  description?: string;
  evidence?: Evidence[];
  date?: string;
  feature?: string;
  path?: string;
  docId?: string;
  docType?: string;
  status?: string;
  gap?: boolean;
  planned?: boolean;
  mapping?: { model: string; choice: string; confidence: number; probabilities: Record<string, number>; createdAt: string; emptyContent: boolean; pendingFiles: { id: string; probability: number }[] };
};
export type EdgeKind =
  | "commit"
  | "ticket"
  | "epic"
  | "link"
  | "affects"
  | "stored"
  | "column"
  | "foreignKey"
  | "partition"
  | "reads"
  | "module"
  | "defines"
  | "imports"
  | "uses"
  | "schema"
  | "domain"
  | "calls"
  | "author"
  | "changes"
  | "touches"
  | "documents"
  | "describes"
  | "contains"
  | "names"
  | "mentions"
  | "supports"
  | "audience";
// Semantic links are model inferences and always excluded by the proof filter.
export type SemanticEdgeKind = EdgeKind | "semantic";
export type BrainEdge = {
  id: string;
  source: string;
  target: string;
  kind: SemanticEdgeKind;
  evidence: Evidence;
  certainty: "belegt" | "abgeleitet" | "zugeordnet";
  /** How strongly the code brain ties a section to a file: the share of its probability mass, 0–1. */
  weight?: number;
};
export const typeLabel: Record<NodeType, string> = {
  feature: "Feature",
  commit: "Commit",
  ticket: "Ticket",
  doc: "Dokument",
  section: "Abschnitt",
  module: "Modul",
  department: "Fachbereich",
  database: "Datenbank",
  table: "Tabelle",
  view: "SQL-View",
  column: "DB-Feld",
  file: "Datei",
  function: "Funktion",
  symbol: "Code-Element",
  parameter: "Parameter",
  person: "Autor",
};
export const typePlural: Record<NodeType, string> = {
  feature: "Features",
  commit: "Commits",
  ticket: "Tickets",
  doc: "Dokumente",
  section: "Abschnitte",
  module: "Module",
  department: "Fachbereiche",
  database: "Datenbanken",
  table: "Tabellen",
  view: "SQL-Views",
  column: "DB-Felder",
  file: "Dateien",
  function: "Funktionen",
  symbol: "Code-Elemente",
  parameter: "Parameter",
  person: "Autoren",
};
export const edgeLabel: Record<SemanticEdgeKind, string> = {
  commit: "gehört zu",
  ticket: "beschreibt",
  epic: "Teil von",
  link: "Jira-Verknüpfung",
  affects: "betrifft Fachbereich",
  stored: "liegt in",
  column: "Feld von",
  foreignKey: "Fremdschlüssel zu",
  partition: "Partition von",
  reads: "SQL-Bezug zu",
  module: "gehört zum Modul",
  defines: "definiert",
  imports: "importiert",
  uses: "verwendet Parameter",
  schema: "ändert Schema",
  domain: "Namensbezug zu",
  calls: "statischer Aufruf zu",
  author: "geschrieben von",
  changes: "ändert Datei",
  touches: "betrifft Modul",
  documents: "Doku-Vorschlag für",
  describes: "beschreibt",
  contains: "enthält",
  names: "nennt",
  mentions: "nennt Funktion im Diff",
  supports: "Beleg im Doku-Vorschlag",
  audience: "Zielgruppe",
  semantic: "fachlich zugeordnet (Jev)",
};
export const nodeOrder: NodeType[] = [
  "department",
  "module",
  "feature",
  "ticket",
  "commit",
  "file",
  "function",
  "symbol",
  "parameter",
  "table",
  "view",
  "column",
  "database",
  "doc",
  "section",
  "person",
];
export const overviewTypes: NodeType[] = [
  "department",
  "module",
  "feature",
  "database",
  "doc",
];
export type Brain = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  metadata: {
    snapshot: string; sources: string[]; method: string;
    analysis?: { files: { file: string; language: string; status: string; errors: unknown[] }[]; sql: { source: string; status: string }[]; unresolvedCalls: { file: string; line: number; name: string; reason: string }[] };
    semantic?: { status: string; model?: string; createdAt?: string; subjects?: number; edges?: number; deferred?: string[]; message?: string; usage?: { requests: number; cached: number; inputTokens: number; estimatedUsd: number } };
  };
};
// Empty until a project is imported; the MOBIQ graph (source-graph.json) is loaded only in showcase mode.
export let brain: Brain = { nodes: [], edges: [], metadata: { snapshot: "", sources: [], method: "" } };
export let nodeById: Record<string, BrainNode> = {};
export function installBrain(graph: Brain | null) {
  if (graph) brain = graph;
  nodeById = Object.fromEntries(brain.nodes.map((n) => [n.id, n]));
}
/** The prepared MOBIQ graph, as its own chunk. */
export const showcaseBrain = async () => (await import("./source-graph.json")).default as unknown as Brain;
export const neighbours = (id: string) =>
  brain.edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => (e.source === id ? e.target : e.source));
export const relations = (id: string) =>
  brain.edges.filter((e) => e.source === id || e.target === id);
