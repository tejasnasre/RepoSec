import { parse } from "yaml";
import { analyzeGraph, manifestRoots } from "./graph";
import type { GraphNode, ParseContext, ResolvedDep } from "./types";

type Block = {
  specs: string[];
  version: string;
  deps: Record<string, string>;
  optional: Record<string, string>;
  isWorkspace: boolean;
};

function parseV1(text: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  let section: "deps" | "optional" | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      if (cur) blocks.push(cur);
      const header = line.replace(/:$/, "");
      cur = {
        specs: header.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
        version: "",
        deps: {},
        optional: {},
        isWorkspace: false,
      };
      section = null;
      continue;
    }
    if (!cur) continue;
    const indent = line.length - line.trimStart().length;
    const t = line.trim();
    if (indent === 2) {
      section = t === "dependencies:" ? "deps" : t === "optionalDependencies:" ? "optional" : null;
      const m = t.match(/^version\s+"?([^"]+)"?$/);
      if (m) cur.version = m[1]!;
    } else if (indent === 4 && section) {
      const m = t.match(/^"?([^"\s]+)"?\s+"?([^"]+)"?$/);
      if (m) (section === "deps" ? cur.deps : cur.optional)[m[1]!] = m[2]!;
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

function parseBerry(text: string): Block[] {
  const doc = parse(text) as Record<string, { version?: string; resolution?: string; dependencies?: Record<string, string> }>;
  const blocks: Block[] = [];
  for (const [key, v] of Object.entries(doc)) {
    if (key === "__metadata" || !v?.version) continue;
    blocks.push({
      specs: key.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
      version: v.version,
      deps: v.dependencies ?? {},
      optional: {},
      isWorkspace: String(v.resolution ?? "").includes("@workspace:"),
    });
  }
  return blocks;
}

/** yarn.lock: classic (v1) and Berry (v2+). */
export function parseYarnLock(ctx: ParseContext): ResolvedDep[] {
  const isBerry = ctx.lockfileText.includes("__metadata:");
  const blocks = (isBerry ? parseBerry(ctx.lockfileText) : parseV1(ctx.lockfileText)).filter(
    (b) => b.version && !b.isWorkspace && /^\d/.test(b.version),
  );

  const nodes = new Map<string, GraphNode>();
  const bySpec = new Map<string, string>();
  const nameOfSpec = (spec: string) => spec.slice(0, spec.indexOf("@", 1));
  for (const b of blocks) {
    const name = nameOfSpec(b.specs[0]!);
    const id = `${name}@${b.version}`;
    nodes.set(id, { id, name, version: b.version, edges: [] });
    for (const s of b.specs) {
      bySpec.set(s, id);
      bySpec.set(s.replace("@npm:", "@"), id);
    }
  }
  const lookup = (dep: string, range: string) => bySpec.get(`${dep}@${range}`) ?? bySpec.get(`${dep}@npm:${range}`) ?? null;
  for (const b of blocks) {
    const node = nodes.get(`${nameOfSpec(b.specs[0]!)}@${b.version}`)!;
    for (const [dep, range] of Object.entries(b.deps)) {
      const to = lookup(dep, range);
      if (to) node.edges.push({ to, optional: false });
    }
    for (const [dep, range] of Object.entries(b.optional)) {
      const to = lookup(dep, range);
      if (to) node.edges.push({ to, optional: true });
    }
  }
  const roots = manifestRoots(ctx, (name, range) => lookup(name, range));
  return analyzeGraph(nodes, roots, ctx);
}
