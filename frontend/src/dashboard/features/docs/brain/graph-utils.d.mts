type Relation = { source: string; target: string };
export function distances(
  edges: Relation[],
  root: string,
  maxDepth?: number,
): Map<string, number>;
export function shortestPath<T extends Relation>(
  edges: T[],
  from: string,
  to: string,
): { nodes: string[]; edges: T[] } | null;
export function projectConnections<T extends Relation>(
  edges: T[],
  visible: string[],
  maxSteps?: number,
): { source: string; target: string; nodes: string[]; edges: T[] }[];
