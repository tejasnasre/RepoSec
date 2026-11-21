import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarUser, SidebarUserSkeleton } from "@/components/sidebar-user";
import { DashboardPrefetch } from "@/components/dashboard-prefetch";
import { QueryProvider } from "@/lib/query-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
    <DashboardPrefetch />
    <SidebarProvider>
      <AppSidebar
        footer={
          <Suspense fallback={<SidebarUserSkeleton />}>
            <SidebarUser />
          </Suspense>
        }
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
    </QueryProvider>
  );
}
