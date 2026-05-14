import Link from "next/link";
import { Database, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkbenchPageHeader } from "@/components/workbench-page-header";
import {
  datasourceTypeIcons,
  emptyDatasourceTypesResponse,
  type DatasourceTypeItem,
  type DatasourceTypesResponse,
} from "@/lib/datasource-types";
import { getJson } from "@/lib/server-api";
import { DeleteDatasourceButton } from "./delete-datasource-button";
import { LocalFileActions } from "./local-file-actions";
import { TablePreviewDialog } from "./table-preview-dialog";

type DatasourcesPageProps = {
  searchParams: Promise<{
    activeDatasourceId?: string;
  }>;
};

type DatasourceRecord = {
  database?: string | null;
  id: string;
  name: string;
  owner?: string;
  schema?: string | null;
  status: string;
  type: string;
  updated_at?: string;
};

type DatabaseTableRecord = {
  file_name?: string;
  header_row?: number;
  id: string;
  name: string;
  remark?: string;
  schema: string;
};

type LocalFileRecord = {
  display_name: string;
  file_name: string;
  header_row?: number;
  id: string;
  sheet_name: string;
  updated_at?: string;
};

export default async function DatasourcesPage({ searchParams }: DatasourcesPageProps) {
  const datasourceTypes = await getJson<DatasourceTypesResponse>(
    "/datasource-types",
    emptyDatasourceTypesResponse,
  );
  const datasourceData = await getJson<{ items: DatasourceRecord[] }>("/datasources", {
    items: [],
  });
  const localFileData = await getJson<{ items: LocalFileRecord[] }>("/local-files", {
    items: [],
  });
  const datasourceOptions = datasourceTypes.categories.flatMap((category) => category.items);
  const params = await searchParams;
  const localFileDatasource: DatasourceRecord | null =
    localFileData.items.length > 0
      ? {
          id: "local-file",
          name: "本地文件",
          owner: "zhourukun",
          status: "ready",
          type: "local-file",
          updated_at: localFileData.items[0]?.updated_at,
        }
      : null;
  const datasourceItems = localFileDatasource
    ? [localFileDatasource, ...datasourceData.items]
    : datasourceData.items;
  const readyCount = datasourceItems.filter((item) => item.status === "ready").length;
  const activeDatasource =
    datasourceItems.find((datasource) => datasource.id === params.activeDatasourceId) ??
    datasourceItems[0];
  const tableData =
    activeDatasource?.id === "local-file"
      ? {
          items: localFileData.items.map((item) => ({
            file_name: item.file_name,
            header_row: item.header_row ?? 1,
            id: item.id,
            name: item.display_name,
            remark: item.sheet_name,
            schema: "本地文件",
          })),
        }
      : activeDatasource
        ? await getJson<{ items: DatabaseTableRecord[] }>(
            `/datasources/${activeDatasource.id}/tables`,
            { items: [] },
          )
        : { items: [] };

  return (
    <div className="flex w-full flex-1 flex-col">
      <WorkbenchPageHeader
        action={
          <Button asChild>
            <Link className="text-#fff!" href="/datasources/create">
              新建数据源
            </Link>
          </Button>
        }
        description="集中维护数据库、本地文件与 API 接入，统一沉淀为可建模的数据来源。"
        eyebrow="DATASOURCE"
        stats={[
          { label: "数据源", value: datasourceItems.length },
          { label: "可用", value: readyCount },
          { label: "数据表", value: tableData.items.length },
        ]}
        title="数据源"
      />

      {datasourceItems.length > 0 ? (
        <div className="grid flex-1 grid-cols-[340px_minmax(0,1fr)] overflow-hidden rounded-[28px] border border-white/70 bg-white/58 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm max-lg:grid-cols-1">
          <aside className="border-r border-white/70 bg-white/26 p-5 max-lg:border-r-0 max-lg:border-b">
            <div className="mb-6">
              <h2 className="text-sm font-medium text-[#111418]">我的数据源</h2>
            </div>
            <div className="space-y-2">
              {datasourceItems.map((datasource) => (
                <DatasourceListItem
                  active={datasource.id === activeDatasource?.id}
                  datasource={datasource}
                  key={datasource.id}
                />
              ))}
            </div>
          </aside>

          <section className="min-w-0 p-5">
            <DatasourceDetail datasource={activeDatasource} tables={tableData.items} />
          </section>
        </div>
      ) : (
        <>
          <div className="w-full rounded-[28px] border border-white/70 bg-white/58 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
            <div className="mb-5">
              <h2 className="text-base font-semibold">数据源</h2>
              <p className="mt-1 text-sm text-muted-foreground">当前还没有接入数据源。</p>
            </div>
            <div className="flex flex-col items-center rounded-2xl bg-[#f3f6fa] px-8 py-12 text-center">
              <div className="relative mb-6 flex size-20 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                <Database className="size-10" />
              </div>
              <p className="text-sm text-muted-foreground">您可以立即开始创建。</p>
            </div>
          </div>
          <CreateDatasourcePanel datasourceOptions={datasourceOptions} />
        </>
      )}
    </div>
  );
}

function DatasourceListItem({
  active,
  datasource,
}: {
  active: boolean;
  datasource: DatasourceRecord;
}) {
  return (
    <div
      className={[
        "group flex items-center gap-2 rounded-xl border border-transparent px-4 py-3 transition-colors",
        active
          ? "border-primary/12 bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
          : "hover:bg-white/55",
      ].join(" ")}
    >
      <Link
        className="flex min-w-0 flex-1 items-center gap-3"
        href={`/datasources?activeDatasourceId=${encodeURIComponent(datasource.id)}`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/90 text-primary shadow-sm">
          {datasource.id === "local-file" ? (
            <FileText className="size-4" />
          ) : (
            <Database className="size-4" />
          )}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{datasource.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            所有者：{datasource.owner || "zhourukun"} / 修改时间：{datasource.updated_at || "-"}
          </span>
        </span>
      </Link>
      {datasource.id === "local-file" ? null : (
        <div className="flex shrink-0 items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button asChild size="icon-xs" variant="ghost">
            <Link
              aria-label={`编辑 ${datasource.name}`}
              href={`/datasources/create/connect?type=${encodeURIComponent(datasource.type)}&datasourceId=${encodeURIComponent(datasource.id)}`}
            >
              <Pencil className="size-3.5" />
            </Link>
          </Button>
          <DeleteDatasourceButton datasourceId={datasource.id} datasourceName={datasource.name} />
        </div>
      )}
    </div>
  );
}

function DatasourceDetail({
  datasource,
  tables,
}: {
  datasource?: DatasourceRecord;
  tables: DatabaseTableRecord[];
}) {
  if (!datasource) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/44">
        <Table>
          <TableHeader>
            <TableRow className="bg-white/40 hover:bg-white/40">
              <TableHead className="min-w-64 pl-4">名称</TableHead>
              <TableHead>Schema</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-72 pr-4 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tables.length > 0 ? (
              tables.map((table) => (
                <TableRow key={table.id}>
                  <TableCell className="pl-4 font-medium">{table.name}</TableCell>
                  <TableCell className="text-muted-foreground">{table.schema}</TableCell>
                  <TableCell className="text-muted-foreground">{table.remark || "-"}</TableCell>
                  <TableCell className="pr-4">
                    {datasource.id === "local-file" ? (
                      <LocalFileActions
                        displayName={table.name}
                        headerRow={table.header_row ?? 1}
                        itemId={table.id}
                      />
                    ) : (
                      <div className="flex justify-end gap-1 text-muted-foreground">
                        <TablePreviewDialog datasourceId={datasource.id} table={table} />
                        <Button asChild size="sm" variant="link">
                          <Link
                            href={`/datasets/create?datasourceId=${encodeURIComponent(datasource.id)}&table=${encodeURIComponent(table.id)}`}
                          >
                            创建数据集
                          </Link>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="py-14 text-center text-muted-foreground" colSpan={4}>
                  {datasource.id === "local-file" ? "暂无本地文件" : "当前数据库未查询到数据表"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CreateDatasourcePanel({ datasourceOptions }: { datasourceOptions: DatasourceTypeItem[] }) {
  return (
    <div className="mt-8 w-full rounded-3xl border border-white/70 bg-white/72! p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold">开始创建</h2>
        <p className="mt-1 text-sm text-muted-foreground">选择常用数据源类型，快速完成接入配置。</p>
      </div>
      {datasourceOptions.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
          {datasourceOptions.map((option) => (
            <DatasourceOption option={option} key={option.type} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#f3f6fa] px-5 py-8 text-center text-sm text-muted-foreground">
          当前接口未返回数据源类型
        </div>
      )}
    </div>
  );
}

function DatasourceOption({ option }: { option: DatasourceTypeItem }) {
  const Icon = datasourceTypeIcons[option.icon as keyof typeof datasourceTypeIcons] ?? Database;

  return (
    <Link
      className="flex h-20 items-center gap-4 rounded-2xl bg-[#f3f6fa] px-5 text-left transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
      href={`/datasources/create/connect?type=${encodeURIComponent(option.type)}&name=${encodeURIComponent(option.name)}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
        <Icon className="size-5" />
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="truncate text-sm font-medium">{option.name}</span>
        <span className="truncate text-xs text-muted-foreground">{option.description}</span>
      </span>
    </Link>
  );
}
