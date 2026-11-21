import type { GraphNode, GraphRoot, ParseContext, ResolvedDep } from "./types";
import { REGISTRY } from "./types";

/** Turns a resolved package graph + roots into deduplicated, classified dependency records. */
export function analyzeGraph(
  nodes: Map<string, GraphNode>,
  roots: GraphRoot[],
  ctx: Pick<ParseContext, "lockfilePath">,
): ResolvedDep[] {
  const byKey = new Map<string, ResolvedDep>();
  const rangeFor = new Map<string, { range: string; manifestPath: string }>();
  for (const r of roots) rangeFor.set(r.to, { range: r.range, manifestPath: r.manifestPath });

  const required = new Set<string>(); // reachable from prod/peer roots via non-optional edges
  const anyProd = new Set<string>(); // reachable from prod/optional/peer roots via any edge
  const pathOf = new Map<string, string[]>();
  const directKinds = new Map<string, Set<string>>();

  function walk(startRoots: GraphRoot[], allowOptional: boolean, into: Set<string>, record: boolean) {
    const queue: { id: string; path: string[] }[] = [];
    for (const r of startRoots) {
      if (!nodes.has(r.to)) continue;
      const node = nodes.get(r.to)!;
      if (!into.has(r.to)) {
        into.add(r.to);
        queue.push({ id: r.to, path: [node.name] });
      }
      if (record) {
        if (!directKinds.has(r.to)) directKinds.set(r.to, new Set());
        directKinds.get(r.to)!.add(r.kind);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const { id, path } = queue[i]!;
      if (record && !pathOf.has(id)) pathOf.set(id, path);
      for (const edge of nodes.get(id)?.edges ?? []) {
        if (edge.optional && !allowOptional) continue;
        const next = nodes.get(edge.to);
        if (!next || into.has(edge.to)) continue;
        into.add(edge.to);
        queue.push({ id: edge.to, path: [...path, next.name] });
      }
    }
  }

  const prodRoots = roots.filter((r) => r.kind === "prod" || r.kind === "peer");
  const optRoots = roots.filter((r) => r.kind === "optional");
  const devRoots = roots.filter((r) => r.kind === "dev");
  walk(prodRoots, false, required, true);
  walk([...prodRoots, ...optRoots], true, anyProd, true);
  const devReach = new Set<string>();
  walk(devRoots, true, devReach, true);

  for (const [id, node] of nodes) {
    const reached = anyProd.has(id) || devReach.has(id);
    if (!reached) continue;
    const kinds = directKinds.get(id);
    const key = `${node.name}@${node.version}`;
    const range = rangeFor.get(id);
    const dep: ResolvedDep = {
      name: node.name,
      version: node.version,
      declaredRange: range?.range ?? null,
      isDirect: !!kinds,
      isDev: !anyProd.has(id),
      isPeer: !!kinds && kinds.size === 1 && kinds.has("peer"),
      isOptional: anyProd.has(id) && !required.has(id),
      path: pathOf.get(id) ?? [node.name],
      lockfile: ctx.lockfilePath,
      manifestPath: range?.manifestPath ?? null,
      registry: REGISTRY,
    };
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, dep);
    else {
      existing.isDirect ||= dep.isDirect;
      existing.isDev &&= dep.isDev;
      existing.isOptional &&= dep.isOptional;
      existing.declaredRange ??= dep.declaredRange;
      existing.manifestPath ??= dep.manifestPath;
      if (dep.path.length < existing.path.length) existing.path = dep.path;
    }
  }
  return [...byKey.values()];
}

export function manifestRoots(
  ctx: Pick<ParseContext, "manifests">,
  resolve: (name: string, range: string, manifestPath: string) => string | null,
): GraphRoot[] {
  const roots: GraphRoot[] = [];
  const add = (map: Record<string, string> | undefined, kind: GraphRoot["kind"], manifestPath: string) => {
    for (const [name, range] of Object.entries(map ?? {})) {
      const to = resolve(name, range, manifestPath);
      if (to) roots.push({ to, kind, name, range, manifestPath });
    }
  };
  for (const m of ctx.manifests) {
    add(m.json.dependencies, "prod", m.path);
    add(m.json.optionalDependencies, "optional", m.path);
    add(m.json.peerDependencies, "peer", m.path);
    add(m.json.devDependencies, "dev", m.path);
  }
  return roots;
}
