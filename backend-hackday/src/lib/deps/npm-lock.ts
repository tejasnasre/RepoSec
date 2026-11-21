import { analyzeGraph, manifestRoots } from "./graph";
import type { GraphNode, ParseContext, ResolvedDep } from "./types";

type LockEntry = {
  version?: string;
  name?: string;
  link?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** package-lock.json / npm-shrinkwrap.json (lockfileVersion 2 and 3; v1 via `dependencies` tree). */
export function parseNpmLock(ctx: ParseContext): ResolvedDep[] {
  const lock = JSON.parse(ctx.lockfileText) as {
    packages?: Record<string, LockEntry>;
    dependencies?: Record<string, { version: string; requires?: Record<string, string>; dependencies?: Record<string, unknown> }>;
  };

  const nodes = new Map<string, GraphNode>();
  let resolveFrom: (fromKey: string, dep: string) => string | null;

  if (lock.packages) {
    const pk = lock.packages;
    const nameOf = (key: string, e: LockEntry) => e.name ?? key.split("node_modules/").pop()!;
    for (const [key, e] of Object.entries(pk)) {
      if (!key.includes("node_modules/") || !e.version || e.link) continue;
      const edges = [
        ...Object.keys(e.dependencies ?? {}).map((d) => ({ d, optional: false })),
        ...Object.keys(e.optionalDependencies ?? {}).map((d) => ({ d, optional: true })),
      ];
      nodes.set(key, {
        id: key,
        name: nameOf(key, e),
        version: e.version,
        edges: edges.map(({ d, optional }) => ({ to: `@@${key}@@${d}`, optional })),
      });
    }
    // Node-style resolution: nested node_modules first, then walk up parent directories.
    resolveFrom = (fromKey, dep) => {
      let base = fromKey;
      for (;;) {
        const candidate = `${base ? base + "/" : ""}node_modules/${dep}`;
        if (nodes.has(candidate)) return candidate;
        if (!base) return null;
        const idx = base.lastIndexOf("/node_modules/");
        base = idx === -1 ? (base.startsWith("node_modules/") ? "" : "") : base.slice(0, idx);
      }
    };
    for (const node of nodes.values()) {
      node.edges = node.edges
        .map((e) => {
          const [, from, dep] = e.to.match(/^@@(.*)@@(.*)$/) ?? [];
          const to = resolveFrom(from!, dep!);
          return to ? { to, optional: e.optional } : null;
        })
        .filter((e): e is { to: string; optional: boolean } => e !== null);
    }
  } else {
    // v1: nested `dependencies` tree
    const walk = (deps: NonNullable<typeof lock.dependencies>, prefix: string) => {
      for (const [name, e] of Object.entries(deps)) {
        const key = `${prefix}node_modules/${name}`;
        nodes.set(key, { id: key, name, version: e.version, edges: [] });
        const nested = e.dependencies as typeof lock.dependencies;
        if (nested) walk(nested, `${key}/`);
      }
    };
    walk(lock.dependencies ?? {}, "");
    resolveFrom = (_from, dep) => (nodes.has(`node_modules/${dep}`) ? `node_modules/${dep}` : null);
  }

  const roots = manifestRoots(ctx, (name, _range, manifestPath) => {
    const dir = manifestPath.replace(/package\.json$/, "").replace(/\/$/, "");
    const rel = ctx.lockDir && dir.startsWith(ctx.lockDir) ? dir.slice(ctx.lockDir.length).replace(/^\//, "") : dir === ctx.lockDir ? "" : dir;
    return resolveFrom(rel, name) ?? resolveFrom("", name);
  });
  return analyzeGraph(nodes, roots, ctx);
}
