import { analyzeGraph, manifestRoots } from "./graph";
import type { GraphNode, ParseContext, ResolvedDep } from "./types";

type BunMeta = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** bun.lock (text format, JSONC with trailing commas). Binary bun.lockb is not supported. */
export function parseBunLock(ctx: ParseContext): ResolvedDep[] {
  const cleaned = ctx.lockfileText.replace(/,(\s*[}\]])/g, "$1");
  const lock = JSON.parse(cleaned) as { packages?: Record<string, unknown[]> };
  const packages = lock.packages ?? {};

  const nodes = new Map<string, GraphNode>();
  const metaOf = new Map<string, BunMeta>();
  for (const [key, entry] of Object.entries(packages)) {
    const spec = String(entry[0] ?? "");
    const at = spec.lastIndexOf("@");
    if (at <= 0) continue;
    const name = spec.slice(0, at);
    const version = spec.slice(at + 1);
    // Skip workspace/file/git/link entries: they are not registry packages.
    if (!/^\d/.test(version)) continue;
    nodes.set(key, { id: key, name, version, edges: [] });
    metaOf.set(key, (entry[2] as BunMeta | undefined) ?? {});
  }

  // Keys look like "pkg" or "parent/child" (scoped names contain one slash).
  const segments = (key: string) => {
    const parts = key.split("/");
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]!.startsWith("@") && parts[i + 1] !== undefined) out.push(`${parts[i]}/${parts[++i]}`);
      else out.push(parts[i]!);
    }
    return out;
  };
  const resolveFrom = (fromKey: string, dep: string): string | null => {
    const segs = fromKey ? segments(fromKey) : [];
    for (let i = segs.length; i >= 0; i--) {
      const candidate = [...segs.slice(0, i), dep].join("/");
      if (nodes.has(candidate)) return candidate;
    }
    return null;
  };

  for (const [key, node] of nodes) {
    const m = metaOf.get(key)!;
    const add = (map: Record<string, string> | undefined, optional: boolean) => {
      for (const dep of Object.keys(map ?? {})) {
        const to = resolveFrom(key, dep);
        if (to) node.edges.push({ to, optional });
      }
    };
    add(m.dependencies, false);
    add(m.optionalDependencies, true);
    add(m.peerDependencies, true);
  }

  const roots = manifestRoots(ctx, (name) => resolveFrom("", name));
  return analyzeGraph(nodes, roots, ctx);
}
