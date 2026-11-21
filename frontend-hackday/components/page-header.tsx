import { SidebarTrigger } from "@/components/ui/sidebar";
import { FetchingIndicator } from "@/components/fetching-indicator";
import { Separator } from "@/components/ui/separator";

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="sticky top-0 z-20 flex flex-col gap-1 border-b bg-background/85 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <FetchingIndicator />
      </div>
      {description && <p className="pl-8 text-sm text-muted-foreground text-pretty">{description}</p>}
    </header>
  );
}
