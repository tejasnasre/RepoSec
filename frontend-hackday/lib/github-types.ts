export type Installation = {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  accountAvatarUrl: string | null;
  repositorySelection: "all" | "selected";
  suspendedAt: string | null;
};

export type Repository = {
  id: string;
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  primaryLanguage: string | null;
  htmlUrl: string;
  archived: boolean;
  installation: { id: string; accountLogin: string; accountType: "User" | "Organization" };
  connected: boolean;
  connectedAt: string | null;
};
