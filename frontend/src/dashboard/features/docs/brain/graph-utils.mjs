export function distances(edges, root, maxDepth = Infinity) {
  const near = new Map([[root, 0]]);
  const queue = [root];
  const adj = adjacency(edges);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      depth = near.get(id);
    if (depth >= maxDepth) continue;
    for (const { other } of adj.get(id) || [])
      if (!near.has(other)) {
        near.set(other, depth + 1);
        queue.push(other);
      }
  }
  return near;
}
function adjacency(edges) {
  const adj = new Map();
  for (const e of edges)
    for (const [id, other] of [
      [e.source, e.target],
      [e.target, e.source],
    ]) {
      if (!adj.has(id)) adj.set(id, []);
      adj.get(id).push({ other, edge: e });
    }
  return adj;
}
export function shortestPath(edges, from, to) {
  if (from === to) return { nodes: [from], edges: [] };
  const adj = adjacency(edges),
    queue = [from],
    visited = new Set([from]),
    prev = new Map();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const { other, edge } of adj.get(id) || []) {
      if (visited.has(other)) continue;
      visited.add(other);
      prev.set(other, { id, edge });
      queue.push(other);
      if (other === to) {
        const nodes = [to],
          route = [];
        let current = to;
        while (current !== from) {
          const p = prev.get(current);
          route.unshift(p.edge);
          nodes.unshift(p.id);
          current = p.id;
        }
        return { nodes, edges: route };
      }
    }
  }
  return null;
}

// Collapse hidden technical nodes into an explorable path, without crossing another visible card.
export function projectConnections(edges, visible, maxSteps = 5) {
  const shown = new Set(visible),
    adj = adjacency(edges),
    result = [];
  const done = new Set();
  for (const root of visible) {
    const queue = [{ id: root, nodes: [root], edges: [] }],
      visited = new Set([root]);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (current.edges.length >= maxSteps) continue;
      for (const { other, edge } of adj.get(current.id) || []) {
        if (visited.has(other)) continue;
        visited.add(other);
        const path = {
          nodes: [...current.nodes, other],
          edges: [...current.edges, edge],
        };
        if (shown.has(other)) {
          const key = [root, other].sort().join("|");
          if (!done.has(key)) {
            done.add(key);
            result.push({ source: root, target: other, ...path });
          }
        } else queue.push({ id: other, ...path });
      }
    }
  }
  return result;
}
