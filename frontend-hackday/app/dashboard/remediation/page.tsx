import { RemediationView } from "@/components/views/remediation-view";
import { PageHeader } from "@/components/page-header";

export default function RemediationPage() {
  return (
    <>
      <PageHeader title="Remediation PRs" description="Security verification and CI are tracked separately: a green build is not proof the vulnerability is gone." />
      <RemediationView />
    </>
  );
}
