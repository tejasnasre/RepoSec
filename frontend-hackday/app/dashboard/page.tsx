import { PageHeader } from "@/components/page-header";
import { OverviewView } from "@/components/views/overview-view";

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Security posture across your connected repositories." />
      <OverviewView />
    </>
  );
}
