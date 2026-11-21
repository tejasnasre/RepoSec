import { InvestigationsView } from "@/components/views/investigations-view";
import { PageHeader } from "@/components/page-header";

export default function InvestigationsPage() {
  return (
    <>
      <PageHeader title="Investigations" description="Evidence-backed research per affected package, tied to the exact commit it analyzed." />
      <InvestigationsView />
    </>
  );
}
