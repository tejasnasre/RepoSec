import { NotificationsView } from "@/components/views/notifications-view";
import { PageHeader } from "@/components/page-header";

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" description="In-app feed. Email delivery follows your preferences in Settings." />
      <NotificationsView />
    </>
  );
}
