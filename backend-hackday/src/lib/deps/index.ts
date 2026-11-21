import { parseBunLock } from "./bun-lock";
import { parseNpmLock } from "./npm-lock";
import { parsePnpmLock } from "./pnpm-lock";
import type { Manifest, ParseContext, ResolvedDep } from "./types";
import { REGISTRY } from "./types";
import { parseYarnLock } from "./yarn-lock";

export type { ResolvedDep, Manifest } from "./types";

export const LOCKFILE_NAMES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"] as const;

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const inNodeModules = (p: string) => p.split("/").includes("node_modules");

export type DiscoveredFiles = {
  lockfiles: string[];
  manifests: string[];
  /** bun.lockb is detected but cannot be parsed (binary). */
  unsupported: string[];
};

export function discoverFiles(paths: string[]): DiscoveredFiles {
  const clean = paths.filter((p) => !inNodeModules(p));
  return {
    lockfiles: clean.filter((p) => (LOCKFILE_NAMES as readonly string[]).includes(baseOf(p))),
    manifests: clean.filter((p) => baseOf(p) === "package.json"),
    unsupported: clean.filter((p) => baseOf(p) === "bun.lockb"),
  };
}

/**
 * Builds the dependency inventory. The lockfile's resolved version is authoritative; a manifest
 * with no covering lockfile yields declared-only entries (version null), never a guessed version.
 */
export function buildInventory(
  files: DiscoveredFiles,
  read: (path: string) => string | undefined,
): { deps: ResolvedDep[]; warnings: string[] } {
  const warnings: string[] = [];
  const manifests = new Map<string, Manifest>();
  for (const p of files.manifests) {
    const text = read(p);
    if (!text) continue;
    try {
      manifests.set(p, { path: p, json: JSON.parse(text) });
    } catch {
      warnings.push(`Could not parse ${p}`);
    }
  }

  // A manifest is covered by the nearest lockfile in its own directory or an ancestor directory.
  const lockDirs = files.lockfiles.map((l) => ({ lock: l, dir: dirOf(l) }));
  const coveredBy = new Map<string, string>();
  for (const mp of manifests.keys()) {
    const md = dirOf(mp);
    const candidates = lockDirs
      .filter((l) => l.dir === "" || md === l.dir || md.startsWith(l.dir + "/"))
      .sort((a, b) => b.dir.length - a.dir.length);
    const nearest = candidates[0];
    if (nearest) coveredBy.set(mp, nearest.lock);
  }

  const deps: ResolvedDep[] = [];
  const parsers: Record<string, (c: ParseContext) => ResolvedDep[]> = {
    "package-lock.json": parseNpmLock,
    "npm-shrinkwrap.json": parseNpmLock,
    "pnpm-lock.yaml": parsePnpmLock,
    "yarn.lock": parseYarnLock,
    "bun.lock": parseBunLock,
  };

  for (const lock of files.lockfiles) {
    const text = read(lock);
    if (!text) {
      warnings.push(`${lock} was skipped (too large or unreadable)`);
      continue;
    }
    const covered = [...coveredBy.entries()].filter(([, l]) => l === lock).map(([m]) => manifests.get(m)!);
    // Root manifest of the lockfile's directory first.
    covered.sort((a, b) => dirOf(a.path).length - dirOf(b.path).length);
    try {
      deps.push(
        ...parsers[baseOf(lock)]!({ lockfilePath: lock, lockfileText: text, manifests: covered, lockDir: dirOf(lock) }),
      );
    } catch (e) {
      warnings.push(`Could not parse ${lock}: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  for (const [mp, m] of manifests) {
    if (coveredBy.has(mp)) continue;
    warnings.push(`${mp} has no lockfile; versions are unknown so vulnerabilities cannot be matched`);
    const add = (map: Record<string, string> | undefined, kind: "prod" | "dev" | "optional" | "peer") => {
      for (const [name, range] of Object.entries(map ?? {})) {
        deps.push({
          name,
          version: null,
          declaredRange: range,
          isDirect: true,
          isDev: kind === "dev",
          isPeer: kind === "peer",
          isOptional: kind === "optional",
          path: [name],
          lockfile: null,
          manifestPath: mp,
          registry: REGISTRY,
        });
      }
    };
    add(m.json.dependencies, "prod");
    add(m.json.optionalDependencies, "optional");
    add(m.json.peerDependencies, "peer");
    add(m.json.devDependencies, "dev");
  }
  for (const u of files.unsupported) warnings.push(`${u} is a binary lockfile and is not supported; use the text bun.lock`);
  return { deps, warnings };
}
