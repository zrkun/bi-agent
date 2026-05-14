import { ScreenEditorWorkbench } from "@/components/screens/screen-editor-workbench";
import { getJson } from "@/lib/server-api";
import type { DatasetRecord } from "@/lib/screens/types";

export default async function NewScreenPage() {
  const data = await getJson<{ items: DatasetRecord[] }>("/datasets", { items: [] });

  return <ScreenEditorWorkbench datasets={data.items} />;
}
