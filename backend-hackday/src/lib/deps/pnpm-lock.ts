import { parse } from "yaml";
import { analyzeGraph } from "./graph";
import type { GraphNode, GraphRoot, ParseContext, ResolvedDep } from "./types";

type Importer = {
  dependencies?: Record<string, { specifier?: string; version?: string } | string>;
  devDependencies?: Record<string, { specifier?: string; version?: string } | string>;
  optionalDependencies?: Record<string, { specifier?: string; version?: string } | string>;
};
type Snapshot = { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };

const stripPeers = (v: string) => v.replace(/\(.*$/, "");

/** pnpm-lock.yaml (v6 and v9). */
export function parsePnpmLock(ctx: ParseContext): ResolvedDep[] {
  const lock = parse(ctx.lockfileText) as {
    importers?: Record<string, Importer>;
    snapshots?: Record<string, Snapshot>;
    packages?: Record<string, Snapshot>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const snapshots = lock.snapshots ?? lock.packages ?? {};

  const nodes = new Map<string, GraphNode>();
  const nameVersion = (id: string) => {
    const clean = stripPeers(id.replace(/^\//, ""));
    const at = clean.lastIndexOf("@");
    return at > 0 ? { name: clean.slice(0, at), version: clean.slice(at + 1) } : null;
  };
  for (const [rawKey, snap] of Object.entries(snapshots)) {
    const id = rawKey.replace(/^\//, "");
    const nv = nameVersion(id);
    if (!nv || !/^\d/.test(nv.version)) continue;
    const edges: GraphNode["edges"] = [];
    const add = (m: Record<string, string> | undefined, optional: boolean) => {
      for (const [dep, ver] of Object.entries(m ?? {})) {
        if (/^(link:|file:|workspace:)/.test(ver)) continue;
        // alias form "npm:real@1.2.3"
        const target = ver.startsWith("npm:") ? ver.slice(4) : `${dep}@${ver}`;
        edges.push({ to: target.replace(/^\//, ""), optional });
      }
    };
    add(snap.dependencies, false);
    add(snap.optionalDependencies, true);
    nodes.set(id, { id, name: nv.name, version: nv.version, edges });
  }
  for (const node of nodes.values()) node.edges = node.edges.filter((e) => nodes.has(e.to));

  const importers: Record<string, Importer> =
    lock.importers ?? { ".": { dependencies: lock.dependencies, devDependencies: lock.devDependencies } };
  const roots: GraphRoot[] = [];
  const addRoots = (m: Importer["dependencies"], kind: GraphRoot["kind"], manifestPath: string) => {
    for (const [name, v] of Object.entries(m ?? {})) {
      const specifier = typeof v === "string" ? "" : (v.specifier ?? "");
      const version = typeof v === "string" ? v : (v.version ?? "");
      if (!version || /^(link:|file:|workspace:)/.test(version)) continue;
      const to = (version.startsWith("npm:") ? version.slice(4) : `${name}@${version}`).replace(/^\//, "");
      if (nodes.has(to)) roots.push({ to, kind, name, range: specifier, manifestPath });
    }
  };
  for (const [dir, imp] of Object.entries(importers)) {
    const manifestPath = `${ctx.lockDir ? ctx.lockDir + "/" : ""}${dir === "." ? "" : dir + "/"}package.json`;
    addRoots(imp.dependencies, "prod", manifestPath);
    addRoots(imp.optionalDependencies, "optional", manifestPath);
    addRoots(imp.devDependencies, "dev", manifestPath);
  }
  return analyzeGraph(nodes, roots, ctx);
}
