import { sql } from "drizzle-orm";
import semver from "semver";
import { db } from "../../db";
import { vulnerabilities } from "../../db/schema";
import { fetchJson, pool } from "./http";

type OsvEvent = { introduced?: string; fixed?: string; last_affected?: string; limit?: string };
export type OsvAffected = {
  package?: { name: string; ecosystem: string };
  ranges?: { type: string; events: OsvEvent[] }[];
  versions?: string[];
};
export type OsvRecord = {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  modified?: string;
  published?: string;
  severity?: { type: string; score: string }[];
  affected?: OsvAffected[];
  references?: { type: string; url: string }[];
  database_specific?: { severity?: string; cwe_ids?: string[] };
};

type GhsaAdvisory = {
  ghsa_id: string;
  cve_id?: string | null;
  severity?: string;
  summary?: string;
  description?: string;
  cvss?: { score?: number | null; vector_string?: string | null };
  cwes?: { cwe_id: string }[];
  published_at?: string;
  updated_at?: string;
  references?: string[];
  vulnerabilities?: { package?: { name: string }; vulnerable_version_range?: string; first_patched_version?: string | null }[];
};

export type VulnRow = typeof vulnerabilities.$inferSelect;
export type Advisory = { row: VulnRow; records: OsvRecord[]; ghsa: GhsaAdvisory | null };

const osvCache = new Map<string, { at: number; rec: OsvRecord | null }>();

/** One OSV batch lookup (affected-version matching is done by OSV against the exact installed version). */
export async function osvQueryBatch(pkgs: { name: string; version: string }[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < pkgs.length; i += 500) {
    const chunk = pkgs.slice(i, i + 500);
    const res = await fetchJson<{ results: { vulns?: { id: string }[] }[] }>(
      "https://api.osv.dev/v1/querybatch",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })) }),
      },
      45_000,
    );
    if (!res) throw new Error("OSV batch query failed");
    res.results.forEach((r, idx) => {
      const p = chunk[idx]!;
      if (r.vulns?.length) out.set(`${p.name}@${p.version}`, r.vulns.map((v) => v.id));
    });
  }
  return out;
}

export async function osvGet(id: string): Promise<OsvRecord | null> {
  const hit = osvCache.get(id);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.rec;
  const rec = await fetchJson<OsvRecord>(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
  osvCache.set(id, { at: Date.now(), rec });
  return rec;
}

export async function ghsaGet(ghsaId: string, token?: string): Promise<GhsaAdvisory | null> {
  return fetchJson<GhsaAdvisory>(`https://api.github.com/advisories/${ghsaId}`, {
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

type Nvd = { vulnerabilities?: { cve: { descriptions?: { lang: string; value: string }[]; metrics?: Record<string, { cvssData: { baseScore: number; baseSeverity?: string; vectorString?: string } }[]>; weaknesses?: { description: { value: string }[] }[] } }[] };

export async function nvdGet(cveId: string) {
  const res = await fetchJson<Nvd>(
    `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`,
    { headers: process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {} },
    12_000,
  );
  const cve = res?.vulnerabilities?.[0]?.cve;
  if (!cve) return null;
  const m = cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV40?.[0] ?? cve.metrics?.cvssMetricV30?.[0];
  return {
    score: m?.cvssData.baseScore ?? null,
    vector: m?.cvssData.vectorString ?? null,
    severity: m?.cvssData.baseSeverity?.toLowerCase() ?? null,
    cwes: (cve.weaknesses ?? []).flatMap((w) => w.description.map((d) => d.value)).filter((v) => v.startsWith("CWE-")),
    description: cve.descriptions?.find((d) => d.lang === "en")?.value ?? null,
  };
}

const severityFromScore = (s: number): VulnRow["severity"] => (s >= 9 ? "critical" : s >= 7 ? "high" : s >= 4 ? "medium" : s > 0 ? "low" : "informational");
const normSeverity = (s?: string | null): VulnRow["severity"] | null => {
  const v = s?.toLowerCase();
  if (v === "moderate") return "medium";
  return v === "critical" || v === "high" || v === "medium" || v === "low" ? v : null;
};

/** Minimum version that fixes this advisory for the installed version of `pkg` (null if no fix published). */
export function patchedVersionFor(records: OsvRecord[], pkg: string, installed: string): string | null {
  const fixes: string[] = [];
  const v = semver.coerce(installed)?.version ?? installed;
  for (const r of records) {
    for (const a of r.affected ?? []) {
      if (a.package?.name !== pkg || a.package.ecosystem.toLowerCase() !== "npm") continue;
      for (const range of a.ranges ?? []) {
        if (range.type !== "SEMVER" && range.type !== "ECOSYSTEM") continue;
        let intro: string | null = null;
        for (const e of range.events) {
          if (e.introduced !== undefined) intro = e.introduced;
          else if (e.fixed !== undefined) {
            const lo = semver.valid(intro === "0" || intro === null ? "0.0.0" : intro);
            if (semver.valid(v) && lo && semver.valid(e.fixed) && semver.gte(v, lo) && semver.lt(v, e.fixed)) fixes.push(e.fixed);
            intro = null;
          }
        }
      }
    }
  }
  if (!fixes.length) return null;
  return fixes.sort(semver.compare).at(-1) ?? null; // the version that fixes ALL records for this package version
}

/**
 * Fetches OSV records, merges the ones that describe the same flaw (shared GHSA/CVE aliases) into one
 * deduplicated advisory, enriches with GitHub Advisory (+ NVD for missing CVSS), and upserts it.
 */
export async function resolveAdvisories(osvIds: string[], ghToken?: string): Promise<Map<string, Advisory>> {
  const unique = [...new Set(osvIds)];
  const records = (await pool(unique, 10, osvGet)).filter((r): r is OsvRecord => !!r);

  // union-find over id ∪ aliases
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const r of records) for (const a of [r.id, ...(r.aliases ?? [])]) union(r.id, a);

  const groups = new Map<string, OsvRecord[]>();
  for (const r of records) {
    const root = find(r.id);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  }

  const result = new Map<string, Advisory>();
  let nvdBudget = 5;
  for (const group of groups.values()) {
    const ids = new Set<string>();
    for (const r of group) [r.id, ...(r.aliases ?? [])].forEach((i) => ids.add(i));
    const ghsaId = [...ids].find((i) => i.startsWith("GHSA-")) ?? null;
    const cveId = [...ids].find((i) => i.startsWith("CVE-")) ?? null;
    const isMalicious = [...ids].some((i) => i.startsWith("MAL-"));
    const canonicalId = ghsaId ?? cveId ?? group[0]!.id;
    const primary = group.find((r) => r.id === ghsaId) ?? group[0]!;

    const ghsa = ghsaId ? await ghsaGet(ghsaId, ghToken) : null;
    let severity = normSeverity(ghsa?.severity) ?? normSeverity(primary.database_specific?.severity) ?? null;
    let severitySource = severity ? (ghsa?.severity ? "GitHub Advisory Database" : "OSV") : null;
    let cvssScore = ghsa?.cvss?.score ?? null;
    let cvssVector = ghsa?.cvss?.vector_string ?? primary.severity?.find((s) => s.type.startsWith("CVSS"))?.score ?? null;
    let cwes = [...new Set([...(ghsa?.cwes?.map((c) => c.cwe_id) ?? []), ...(primary.database_specific?.cwe_ids ?? [])])];
    let description: string | null = null;

    if (cveId && (cvssScore === null || !cwes.length) && nvdBudget-- > 0) {
      const nvd = await nvdGet(cveId);
      if (nvd) {
        cvssScore ??= nvd.score;
        cvssVector = (cvssVector && cvssVector.startsWith("CVSS:")) ? cvssVector : (nvd.vector ?? cvssVector);
        if (!cwes.length) cwes = nvd.cwes;
        description = nvd.description;
        if (!severity && nvd.severity) {
          severity = normSeverity(nvd.severity);
          severitySource = "NVD";
        }
      }
    }
    if (isMalicious) {
      severity = "critical";
      severitySource = "OSV malicious-packages";
    }
    if (!severity && cvssScore !== null) {
      severity = severityFromScore(cvssScore);
      severitySource = "CVSS base score";
    }

    const refs = new Map<string, { type: string; url: string; source: string }>();
    for (const r of group) for (const ref of r.references ?? []) refs.set(ref.url, { type: ref.type, url: ref.url, source: "osv" });
    for (const url of ghsa?.references ?? []) if (!refs.has(url)) refs.set(url, { type: "WEB", url, source: "github" });

    const values = {
      canonicalId,
      aliases: [...ids].sort(),
      osvIds: group.map((r) => r.id),
      ghsaId,
      cveId,
      isMalicious,
      summary: ghsa?.summary ?? primary.summary ?? null,
      details: (ghsa?.description ?? primary.details ?? description ?? "").slice(0, 8000) || null,
      severity: severity ?? "unknown",
      severitySource,
      cvssScore,
      cvssVector,
      cwes,
      publishedAt: ghsa?.published_at ? new Date(ghsa.published_at) : primary.published ? new Date(primary.published) : null,
      modifiedAt: ghsa?.updated_at ? new Date(ghsa.updated_at) : primary.modified ? new Date(primary.modified) : null,
      references: [...refs.values()].slice(0, 40),
      affected: group.flatMap((r) => r.affected ?? []).slice(0, 20),
      sources: ["osv", ...(ghsa ? ["github"] : []), ...(description || cvssScore !== null ? ["nvd"] : [])],
      fetchedAt: new Date(),
    } satisfies typeof vulnerabilities.$inferInsert;

    const [row] = await db
      .insert(vulnerabilities)
      .values(values)
      .onConflictDoUpdate({ target: vulnerabilities.canonicalId, set: values })
      .returning();
    const adv: Advisory = { row: row!, records: group, ghsa };
    for (const r of group) result.set(r.id, adv);
  }
  void sql;
  return result;
}
