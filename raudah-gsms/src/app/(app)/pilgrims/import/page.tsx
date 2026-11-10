import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "./wizard";
import { commitImportAction, previewImportAction } from "../../actions";

export const metadata: Metadata = { title: "Import pilgrims" };

export default async function ImportPage() {
  const user = await requirePageUser("pilgrims.write");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Import pilgrims" sub={`${current.code} · ${current.name}`}>
        <Button asChild variant="outline"><a href="/api/templates/pilgrims">Download branded template</a></Button>
      </PageHeader>
      <ImportWizard preview={previewImportAction.bind(null, current.id)} commit={commitImportAction.bind(null, current.id)} />
    </div>
  );
}
