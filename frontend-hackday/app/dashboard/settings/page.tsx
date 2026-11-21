import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/views/settings-view";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="GitHub integration and email preferences." />
      <SettingsView />
    </>
  );
}
