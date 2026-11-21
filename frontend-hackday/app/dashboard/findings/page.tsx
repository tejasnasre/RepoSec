import { Suspense } from "react";
import { FindingsView } from "@/components/views/findings-view";
import { PageHeader } from "@/components/page-header";
import { RepositoryListSkeleton } from "@/components/skeletons";

export default function FindingsPage() {
  return (
    <>
      <PageHeader title="Security Findings" description="Installed versions that match an advisory. A finding does not by itself prove the code is exploitable." />
      <Suspense fallback={<RepositoryListSkeleton rows={6} />}>
        <FindingsView />
      </Suspense>
    </>
  );
}
