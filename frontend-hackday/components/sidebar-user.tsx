import { getSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export async function SidebarUser() {
  const session = await getSession();
  if (!session) redirect("/");
  const { user } = session;

  return (
    <div className="flex flex-col gap-2 group-data-[collapsible=icon]:items-center">
      <div className="flex items-center gap-2 overflow-hidden">
        {user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-8 shrink-0 rounded-full" />
        )}
        <div className="grid min-w-0 text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.githubLogin ? `@${user.githubLogin}` : user.email}
          </span>
        </div>
      </div>
      <div className="group-data-[collapsible=icon]:hidden">
        <SignOutButton />
      </div>
    </div>
  );
}

export function SidebarUserSkeleton() {
  return (
    <div className="flex flex-col gap-2 group-data-[collapsible=icon]:items-center" aria-busy="true">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-8 w-20 rounded-lg group-data-[collapsible=icon]:hidden" />
    </div>
  );
}
