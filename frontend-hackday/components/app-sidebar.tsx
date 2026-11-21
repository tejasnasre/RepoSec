"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useApi } from "@/lib/use-api";
import { primaryNav, secondaryNav, type NavItem } from "@/lib/nav";

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

/** Unread count from the cached notifications feed (no extra request: the dashboard already warms it). */
function UnreadBadge() {
  const unread = useApi<{ unread: number }>("/notifications").data?.unread ?? 0;
  if (unread === 0) return null;
  return <SidebarMenuBadge className="bg-sky-600 !text-white">{unread > 99 ? "99+" : unread}</SidebarMenuBadge>;
}

function NavGroupView({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string | null }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ title, href, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton isActive={isActive(pathname, href)} tooltip={title} render={<Link href={href} />}>
                <Icon />
                <span>{title}</span>
              </SidebarMenuButton>
              {href === "/dashboard/notifications" && pathname !== null && <UnreadBadge />}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ActiveNavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return <NavGroupView label={label} items={items} pathname={usePathname()} />;
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <Suspense fallback={<NavGroupView label={label} items={items} pathname={null} />}>
      <ActiveNavGroup label={label} items={items} />
    </Suspense>
  );
}

/** `footer` is a slot so the (dynamic) user menu can sit in its own Suspense boundary. */
export function AppSidebar({ footer }: { footer: React.ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">RepoSec</span>
                <span className="truncate text-xs text-muted-foreground">Security intelligence</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Security" items={primaryNav} />
        <NavGroup label="Workspace" items={secondaryNav} />
      </SidebarContent>
      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
