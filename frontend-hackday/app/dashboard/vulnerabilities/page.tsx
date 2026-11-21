import { VulnerabilitiesView } from "@/components/views/vulnerabilities-view";
import { PageHeader } from "@/components/page-header";

export default function VulnerabilitiesPage() {
  return (
    <>
      <PageHeader title="Vulnerabilities" description="Advisories deduplicated across OSV, GitHub Advisory Database and NVD. The same flaw under a CVE and a GHSA id counts once." />
      <VulnerabilitiesView />
    </>
  );
}
