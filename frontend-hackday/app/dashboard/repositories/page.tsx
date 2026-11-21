import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { RepositoryListSkeleton } from "@/components/skeletons";
import { RepositoriesView } from "@/components/views/repositories-view";

export default function RepositoriesPage() {
  return (
    <>
      <PageHeader title="Repositories" description="Connect repositories through the GitHub App; each one is analyzed in the background." />
      <Suspense fallback={<RepositoryListSkeleton />}>
        <RepositoriesView />
      </Suspense>
    </>
  );
}
