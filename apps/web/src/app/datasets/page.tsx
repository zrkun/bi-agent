import Link from "next/link";
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
import { BarChart3 } from "lucide-react";
import { getJson } from "@/lib/server-api";
import { DatasetActionButtons } from "./dataset-action-buttons";

type DatasetRecord = {
  datasource_id: string;
  dimension_count?: number;
  field_count?: number;
  id: string;
  measure_count?: number;
  name: string;
  owner?: string;
  source_tables: string[];
  source_type: string;
  status: string;
  time_count?: number;
  updated_at?: string;
};

function formatSourceTables(tables: string[]) {
  if (tables.length <= 2) {
    return tables.join("、");
  }

  return `${tables.slice(0, 2).join("、")} 等 ${tables.length} 张表`;
}

export default async function DatasetsPage() {
  const datasetData = await getJson<{ items: DatasetRecord[] }>("/datasets", { items: [] });
  const readyCount = datasetData.items.filter((item) => item.status === "ready").length;

  return (
    <div className="flex flex-1 flex-col">
      <WorkbenchPageHeader
        action={
          <Button asChild>
            <Link className="text-#fff!" href="/datasets/create">
              新建数据集
            </Link>
          </Button>
        }
        description="统一管理多表模型、字段编排与预览配置。"
        eyebrow="DATASET"
        stats={[
          { label: "数据集", value: datasetData.items.length },
          { label: "可用", value: readyCount },
        ]}
        title="数据集"
      />

      <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/58 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <Table containerClassName="flex-1">
          <TableHeader>
            <TableRow className="bg-white/45 hover:bg-white/45">
              <TableHead className="min-w-64">名称</TableHead>
              <TableHead>所有者</TableHead>
              <TableHead>修改人</TableHead>
              <TableHead>修改时间</TableHead>
              <TableHead className="max-w-[360px]">数据源</TableHead>
              <TableHead className="w-36 pr-6">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datasetData.items.length > 0 ? (
              datasetData.items.map((dataset) => (
                <TableRow className="text-[#717781]" key={dataset.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <BarChart3 className="size-3.5" />
                      </span>
                      <span className="font-medium">{dataset.name}</span>
                      <span className="text-[10px] font-semibold text-red-500">
                        {dataset.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      字段 {dataset.field_count ?? 0} / 维度 {dataset.dimension_count ?? 0} / 指标{" "}
                      {dataset.measure_count ?? 0} / 时间 {dataset.time_count ?? 0}
                    </div>
                  </TableCell>
                  <TableCell>{dataset.owner || "zhourukun"}</TableCell>
                  <TableCell>{dataset.owner || "zhourukun"}</TableCell>
                  <TableCell>{dataset.updated_at || "-"}</TableCell>
                  <TableCell className="max-w-[360px]">
                    <div
                      className="truncate text-muted-foreground"
                      title={`${dataset.source_type} / ${dataset.source_tables.join("、")}`}
                    >
                      <span className="text-foreground">{dataset.source_type}</span>
                      <span className="mx-1 text-muted-foreground/70">/</span>
                      {formatSourceTables(dataset.source_tables)}
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <DatasetActionButtons dataset={dataset} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-[420px] text-center" colSpan={6}>
                  <div className="flex h-full flex-col items-center justify-center">
                    <img alt="" className="mb-3 h-[120px] w-[160px]" src="/empty-dataset.svg" />
                    <span className="text-sm text-muted-foreground">
                      暂无数据集，请先从数据源创建。
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
