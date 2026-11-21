export type ResolvedDep = {
  name: string;
  /** null when only a manifest (no lockfile) declares it: the version is then unknown, never guessed. */
  version: string | null;
  declaredRange: string | null;
  isDirect: boolean;
  isDev: boolean;
  isPeer: boolean;
  isOptional: boolean;
  /** Root-first chain of package names ending with this package. */
  path: string[];
  lockfile: string | null;
  manifestPath: string | null;
  registry: string;
};

export type Manifest = {
  path: string; // repo-relative path of package.json
  json: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    workspaces?: unknown;
  };
};

export type RootKind = "prod" | "dev" | "optional" | "peer";
export type GraphNode = { id: string; name: string; version: string; edges: { to: string; optional: boolean }[] };
export type GraphRoot = { to: string; kind: RootKind; name: string; range: string; manifestPath: string };

export type ParseContext = {
  lockfilePath: string;
  lockfileText: string;
  /** Manifests covered by this lockfile (root first, then workspaces). */
  manifests: Manifest[];
  /** Directory of the lockfile relative to repo root ("" for root). */
  lockDir: string;
};

export const REGISTRY = "https://registry.npmjs.org";
