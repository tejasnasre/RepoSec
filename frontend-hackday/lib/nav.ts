import {
  Activity,
  Bell,
  FileSearch,
  GitPullRequest,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  ShieldCheck,
  FolderGit2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const primaryNav: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Repositories", href: "/dashboard/repositories", icon: FolderGit2 },
  { title: "Security Findings", href: "/dashboard/findings", icon: ShieldAlert },
  { title: "Vulnerabilities", href: "/dashboard/vulnerabilities", icon: ShieldCheck },
  { title: "Investigations", href: "/dashboard/investigations", icon: FileSearch },
  { title: "Remediation PRs", href: "/dashboard/remediation", icon: GitPullRequest },
];

export const secondaryNav: NavItem[] = [
  { title: "Activity", href: "/dashboard/activity", icon: Activity },
  { title: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const allNav = [...primaryNav, ...secondaryNav];
