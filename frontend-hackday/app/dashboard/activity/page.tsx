import { ActivityView } from "@/components/views/activity-view";
import { PageHeader } from "@/components/page-header";

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" description="Scans, commits, reports and fixes across your repositories." />
      <ActivityView />
    </>
  );
}
