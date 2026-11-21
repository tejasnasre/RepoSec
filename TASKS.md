# TASKS: Repository Security Intelligence Platform

Source of truth for scope: [Product.md](Product.md). This file tracks build progress only.
Legend: `[x]` done and verified · `[~]` built, not verified end to end · `[ ]` todo · `[!]` needs the user

## Run it (three processes)

```
cd backend-hackday  && bun run dev            # API        :4000
cd backend-hackday  && bun run worker         # worker     :4100 (health)  <- required for scans
cd frontend-hackday && bun run dev            # Next.js    :3000
```
Note: `bun --watch` does not reload `.env`; touch a source file after changing env vars.

## Decisions (keep updated)

- Layout: `frontend-hackday/` (Next.js), `backend-hackday/` (Elysia API + worker as a separate entrypoint `src/worker/index.ts`).
- Queue: PostgreSQL (`background_jobs`, `FOR UPDATE SKIP LOCKED`). One *queued* job per dedupe key (pushes coalesce); a running job may overlap with one queued follow-up.
- Login = GitHub OAuth (read:user, user:email). Repo access and PRs = **GitHub App**, never the login token. The install callback proves ownership with the user's own token (`/user/installations`) before linking an installation.
- DB driver: **node-postgres**, not `Bun.sql`: Drizzle's bun-sql driver double-encodes jsonb (found and fixed; 1351 stored values repaired).
- AI: Gemini only; model/key/search flag from env. Tools run on our side; tool output is wrapped as untrusted data. Deterministic facts (patched versions, severity) override model output. Google Search grounding is gated by `GEMINI_SEARCH_ENABLED` (off: the free key hits quota).
- Dependency inventory is lockfile-authoritative (npm, pnpm, yarn v1/berry, bun text lock). Manifest-only packages are listed with an unknown version and never matched.
- PRs change the manifest only (direct bump or override/resolution). The lockfile is **not** regenerated and tests are **not** run by RepoSec (repo code is never executed on our host); the PR body says so, and the merged lockfile is re-analyzed to verify.
- Simplified vs. spec: `dependency_versions` / `dependency_relationships` folded into `repository_dependencies` (dependency path stored per row); `package_advisories` folded into `vulnerabilities`.
- Caching: dashboard list tabs are client views on TanStack Query (stale 60s, kept 30m, all tabs prefetched on load). Mutations must call `useRefreshAll()` from `lib/use-api.ts`, not bare `router.refresh()`. API has an 8s in-memory TTL cache (`backend-hackday/src/lib/cache.ts`) cleared on every non-GET request; worker changes show up within the TTL.
- Frontend: Next.js 16 has breaking changes; read `frontend-hackday/node_modules/next/dist/docs/` before writing Next code. Lint own code with `bunx eslint app components hooks lib proxy.ts` (repo-wide lint also scans vendored `.agents/`).

## Phase 1: Foundation: DONE
- [x] Next.js 16 + Tailwind 4 + shadcn/base-ui, Elysia + Bun, Neon + Drizzle, Better Auth + GitHub OAuth, landing page
- [x] Dashboard shell (9 sections), skeletons, spinners, error boundary
- [x] Standard API error format `{error:{code,message,details?}}` (global handler; fixed: ApiError thrown in sub-plugins was returning 500)

## Phase 2: GitHub integration: DONE except live webhooks
- [x] GitHub App `hackday-nfsu` (App ID 5859876); private key + client secret in `.env`
- [x] Schema, JWT + installation tokens, signed install `state`, callback with ownership proof, repo sync, connect/disconnect (verified: installation linked, 14 repos synced)
- [x] Repository selection UI (connected cards with live status, available list with multi-connect)
- [x] Webhook endpoint: HMAC-SHA256 verified (tested), idempotent on `X-GitHub-Delivery` (tested duplicate), 503 if secret unset
- [!] **User**: to receive webhooks (push, merge, CI) you need a public tunnel (`ngrok http 4000` / `cloudflared`). Then on the GitHub App: tick Webhook Active, URL `https://<tunnel>/api/v1/webhooks/github`, set a secret (`openssl rand -hex 32`) and put the same value in `GITHUB_WEBHOOK_SECRET`, then re-select events (Push, Pull request, Check run, Check suite, Workflow run).
- [!] **User**: the app is installed on `tejasnasre` with **All repositories**; narrow it at https://github.com/settings/installations/184282869

## Phase 3: Queue, worker, dependency analysis: DONE (verified on a real private repo)
- [x] `background_jobs` + attempts; retry with exponential backoff, timeouts, dead-letter, stale-lock reaper, graceful shutdown, `:4100` health
- [x] Real stage progress (9 stages) in `analysis_stages`; UI polls it; no fake percentages
- [x] Snapshot at exact SHA via GitHub tree/contents API (no code execution); monorepo/workspace aware
- [x] Parsers: package-lock (v1/2/3), bun.lock, pnpm-lock (v6/v9), yarn.lock (v1 + berry); direct/transitive/dev/peer/optional + dependency path (verified on this project's own lockfiles and a real repo's package-lock)
- [x] npm registry metadata: latest vs latest stable vs latest compatible kept separate; deprecation
- [x] Dependency inventory UI (filters, search, pagination)

## Phase 4: Vulnerability intelligence: DONE (verified)
- [x] OSV batch, GitHub Advisory, NVD clients; cross-source dedup via aliases (122 unique advisories in the real run)
- [x] Patched-version resolution with semver; severity with source + CVSS; classification (known / malicious / deprecated); outdated kept out of security totals
- [x] Findings, vulnerabilities, finding detail UI; status workflow (false positive, accepted risk) inherited across scans

## Phase 5: Gemini investigation: DONE (verified: 6 investigations completed in the real run)
- [x] Gemini client (tool calling, structured JSON, optional grounding, quota-aware concurrency + retry)
- [x] 20 tools with strict schemas; SSRF-safe URL allowlist; untrusted-content wrapping; prompt-injection rules
- [x] Evidence model (confirmed requires a source URL; official vs advisory vs community labeled); reachability only from code usage
- [x] Bounded parallel investigations (3 at a time, top `INVESTIGATION_LIMIT=6` by risk); failures don't fail the scan
- [x] Executive summary + ranked priority (severity, direct, patch available, reachability; not CVSS alone)
- [x] Report page A-G + evidence + timeline

## Phase 6: Remediation
- [x] Remediation plan per investigation; **Copy remediation prompt** built from real data (verified: repo, commit, advisories, references, migration, validation steps)
- [~] **Create GitHub PR**: branch `security/SEC-<id>-<pkg>`, manifest change, commit, PR with full body; never touches the default branch, never merges. Built and typechecked, **NOT executed** (it would push a real branch to your private repo). Try it from an investigation report.
- [x] PR confirmation panel + remediation page (PR state, security verification, CI, "validation not run by RepoSec")

## Phase 7: Continuous monitoring
- [x] Push webhook -> coalesced analysis (the same exact commit is never analyzed twice)
- [x] Periodic advisory refresh job (worker scheduler, `ADVISORY_REFRESH_MINUTES`); new advisory -> new historical analysis
- [~] PR merge -> analyze merge commit -> verify against the *resulting lockfile* (fix verified / partially / still vulnerable). Built, untested (needs webhooks + a merged PR)
- [x] Finding status lifecycle (open ... fix_verified / still_vulnerable / false_positive / accepted_risk)

## Phase 8: Notifications and CI
- [x] In-app notifications, dedup by event key, per-user preferences (severity threshold, event types, low-priority digest); one alert per package, not per advisory
- [x] Email module (Resend) with delivery log + retries; **without `RESEND_API_KEY` deliveries are logged as `skipped`** (verified)
- [~] CI: `check_run` / `check_suite` / `workflow_run` correlated to repo + SHA + PR; shown on the remediation page; a failure notification states CI is not attributed to the fix. Built, untested (needs webhooks)
- [x] Notifications page, settings (preferences, installations, delivery log)
- [!] **User**: add `RESEND_API_KEY` (+ `EMAIL_FROM`) to `backend-hackday/.env` to actually send email

## Security checklist
- [x] Webhook signatures, least-privilege App permissions, installation tokens never stored/logged/returned
- [x] Authorization checked for every repo/plan/finding id (never trusts client ids)
- [x] Per-IP rate limits + 10/min on create-PR, audit log table (`audit_logs`), secret-free logging
- [x] Repo code never executed (text only); the AI gets excerpts + metadata only
- [ ] Not done: CSP headers, redis-backed rate limits (in-memory per process)

## Known gaps / next
- PR does not regenerate the lockfile (by design, see Decisions); consider an isolated sandbox runner (container, no network, no secrets) for real validation.
- Overview totals count advisory-level findings (one per advisory per package version): 172 for the test repo vs 27 vulnerable packages. Consider "packages affected" as the headline.
- Search grounding disabled (quota); official sources come from GitHub/npm/NVD/OSV fetch tools.
- A full scan of a ~550-package repo takes ~5 min (advisory enrichment ~2 min is sequential; could be parallelized).

## Changelog
- 2026-11-21: Phases 1-2 (auth, shell, GitHub App, install flow, repo selection).
- 2026-11-21 (build pass 1+2): schema (jobs, analysis, security, investigations, remediation, CI, notifications, audit), queue + worker, lockfile parsers, OSV/GHSA/NVD intel, Gemini investigation engine, report builder, remediation (prompt + PR), webhooks + CI, notifications + email, full REST API, 12 frontend screens.
- 2026-11-21 (verification): real run on `tejasnasre/communex`: 552 packages, 27 vulnerable (9 critical advisories), 122 unique advisories, 6 AI investigations, report + notifications. 18 API endpoints return 200; 16 pages render. Bugs found and fixed: jsonb double-encoding (driver), ApiError mapped to 500 in sub-plugins, finding page read the wrong object, one alert per advisory (now per package).
