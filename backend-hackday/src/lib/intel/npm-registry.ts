import semver from "semver";
import { fetchJson } from "./http";

type Packument = {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { deprecated?: string }>;
};

const cache = new Map<string, { at: number; doc: Packument | null }>();

/** Abbreviated packument: dist-tags + versions (with per-version `deprecated`). */
export async function getPackument(name: string): Promise<Packument | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.doc;
  const doc = await fetchJson<Packument>(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  cache.set(name, { at: Date.now(), doc });
  return doc;
}

export type PackageSummary = {
  latest: string | null;
  latestStable: string | null;
  latestCompatible: string | null;
  deprecatedMessage: string | null;
};

/** latest / latest stable / latest compatible with the declared range are kept separate on purpose. */
export function summarize(doc: Packument | null, installed: string | null, declaredRange: string | null): PackageSummary {
  if (!doc?.versions) return { latest: null, latestStable: null, latestCompatible: null, deprecatedMessage: null };
  const all = Object.keys(doc.versions).filter((v) => semver.valid(v));
  const stable = all.filter((v) => !semver.prerelease(v));
  const latestStable = stable.length ? stable.sort(semver.rcompare)[0]! : null;
  let latestCompatible: string | null = null;
  if (declaredRange && semver.validRange(declaredRange)) latestCompatible = semver.maxSatisfying(stable, declaredRange);
  return {
    latest: doc["dist-tags"]?.latest ?? latestStable,
    latestStable,
    latestCompatible,
    deprecatedMessage: installed ? (doc.versions[installed]?.deprecated ?? null) : null,
  };
}

export type FullPackageInfo = {
  repositoryUrl: string | null;
  homepage: string | null;
  time: Record<string, string>;
  latest: string | null;
};

/** Full document (heavy). Only used for packages that actually have findings. */
export async function getFullInfo(name: string): Promise<FullPackageInfo | null> {
  const doc = await fetchJson<{
    repository?: { url?: string } | string;
    homepage?: string;
    time?: Record<string, string>;
    "dist-tags"?: Record<string, string>;
  }>(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {}, 25_000);
  if (!doc) return null;
  const repo = typeof doc.repository === "string" ? doc.repository : doc.repository?.url;
  return {
    repositoryUrl: repo ? normalizeRepoUrl(repo) : null,
    homepage: doc.homepage ?? null,
    time: doc.time ?? {},
    latest: doc["dist-tags"]?.latest ?? null,
  };
}

export function normalizeRepoUrl(raw: string): string | null {
  const m = raw.replace(/^git\+/, "").replace(/\.git$/, "").match(/github\.com[/:]([^/]+)\/([^/#]+)/);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}
