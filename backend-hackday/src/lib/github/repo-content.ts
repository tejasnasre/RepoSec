import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { githubInstallations, githubRepositories } from "../../db/schema";
import { ApiError } from "../errors";
import { ghFetch, ghText } from "./api";
import { getInstallationToken } from "./app-auth";

export type RepoCtx = {
  repositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: number;
  /** Installation token. Never log or return it. */
  token: string;
};

export async function loadRepoContext(repositoryId: string): Promise<RepoCtx> {
  const [row] = await db
    .select({ repo: githubRepositories, installationId: githubInstallations.installationId })
    .from(githubRepositories)
    .innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationRowId))
    .where(and(eq(githubRepositories.id, repositoryId)))
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "Repository not found");
  return {
    repositoryId,
    owner: row.repo.owner,
    name: row.repo.name,
    fullName: row.repo.fullName,
    defaultBranch: row.repo.defaultBranch,
    installationId: row.installationId,
    token: await getInstallationToken(row.installationId),
  };
}

const auth = (ctx: RepoCtx) => `Bearer ${ctx.token}`;

export async function getBranchHead(ctx: RepoCtx, branch: string) {
  const c = await ghFetch<{ sha: string; commit: { message: string; author?: { date?: string } } }>(
    `/repos/${ctx.owner}/${ctx.name}/commits/${encodeURIComponent(branch)}`,
    auth(ctx),
  );
  return { sha: c.sha, message: c.commit.message.split("\n")[0] ?? "", authoredAt: c.commit.author?.date ? new Date(c.commit.author.date) : null };
}

export type TreeEntry = { path: string; type: "blob" | "tree"; size?: number; sha: string };

export async function getTree(ctx: RepoCtx, sha: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const t = await ghFetch<{ tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${ctx.owner}/${ctx.name}/git/trees/${sha}?recursive=1`,
    auth(ctx),
  );
  return { entries: t.tree, truncated: t.truncated };
}

export function getFileText(ctx: RepoCtx, path: string, ref: string) {
  return ghText(`/repos/${ctx.owner}/${ctx.name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`, auth(ctx));
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;
const SKIP_DIRS = /(^|\/)(node_modules|dist|build|\.next|coverage|vendor|\.git|out)(\/|$)/;
const MAX_FILE_BYTES = 150_000;
const MAX_SOURCE_FILES = 250;

/**
 * A consistent view of one commit: tree + cached file reads. Source files are only ever *read*
 * as text (never executed) and only excerpts are sent to the AI.
 */
export class RepoSnapshot {
  private cache = new Map<string, Promise<string | undefined>>();
  private sourceIndex?: Promise<Map<string, string>>;

  constructor(
    readonly ctx: RepoCtx,
    readonly sha: string,
    readonly tree: TreeEntry[],
  ) {}

  file(path: string, maxBytes = 3_000_000) {
    const entry = this.tree.find((e) => e.path === path);
    if (entry?.size && entry.size > maxBytes) return Promise.resolve(undefined);
    let p = this.cache.get(path);
    if (!p) {
      p = getFileText(this.ctx, path, this.sha);
      this.cache.set(path, p);
    }
    return p;
  }

  private async sources() {
    this.sourceIndex ??= (async () => {
      const files = this.tree
        .filter((e) => e.type === "blob" && SOURCE_EXT.test(e.path) && !SKIP_DIRS.test(e.path) && (e.size ?? 0) < MAX_FILE_BYTES)
        .slice(0, MAX_SOURCE_FILES);
      const out = new Map<string, string>();
      for (let i = 0; i < files.length; i += 10) {
        await Promise.all(
          files.slice(i, i + 10).map(async (f) => {
            const text = await this.file(f.path, MAX_FILE_BYTES);
            if (text) out.set(f.path, text);
          }),
        );
      }
      return out;
    })();
    return this.sourceIndex;
  }

  /** Static import/require references to `pkg` in source files. Evidence of usage, not of exploitability. */
  async findPackageUsage(pkg: string, limit = 12) {
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const re = new RegExp(`(?:from\\s+|require\\(\\s*|import\\(\\s*|import\\s+)['"]${escaped}(?:/[^'"]*)?['"]`);
    const hits: { file: string; line: number; snippet: string }[] = [];
    for (const [file, text] of await this.sources()) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && hits.length < limit; i++) {
        if (re.test(lines[i]!)) hits.push({ file, line: i + 1, snippet: lines[i]!.trim().slice(0, 200) });
      }
      if (hits.length >= limit) break;
    }
    return hits;
  }

  async searchCode(query: string, limit = 15) {
    const q = query.toLowerCase();
    const hits: { file: string; line: number; snippet: string }[] = [];
    for (const [file, text] of await this.sources()) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && hits.length < limit; i++) {
        if (lines[i]!.toLowerCase().includes(q)) hits.push({ file, line: i + 1, snippet: lines[i]!.trim().slice(0, 200) });
      }
      if (hits.length >= limit) break;
    }
    return hits;
  }
}
