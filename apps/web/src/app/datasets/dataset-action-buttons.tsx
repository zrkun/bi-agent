"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Clock3,
  Eye,
  FileBarChart,
  Hash,
  Pencil,
  RefreshCw,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DeleteDatasetButton } from "./delete-dataset-button";

type DatasetActionButtonsProps = {
  dataset: {
    datasource_id: string;
    id: string;
    name: string;
  };
};

type DatasetDetailResponse = {
  item: null | {
    datasource_id: string;
    fields: Array<{
      aggregation?: string | null;
      config?: {
        expression?: {
          leftFieldKey: string;
          operator: "+" | "-" | "*" | "/";
          rightFieldKey: string;
        } | null;
        field_kind?: "calculated" | "source";
      };
      data_type: string;
      display_name: string;
      id: string;
      selected: boolean;
      semantic_type: string;
      source_name: string;
    }>;
    id: string;
    name: string;
    relationships: Array<{
      conditions: Array<{
        left_field: string;
        operator: string;
        right_field: string;
      }>;
      join_type: string;
      left_table: string;
      right_table: string;
    }>;
    source_tables: string[];
    source_type: string;
    updated_at?: string;
  };
};

type DatasetPreviewResponse = {
  columns?: string[];
  rows: Array<Record<string, string>>;
};

export function DatasetActionButtons({ dataset }: DatasetActionButtonsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DatasetDetailResponse["item"]>(null);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);
  const previewColumns = useMemo(
    () => detail?.fields.filter((field) => field.selected).map((field) => field.display_name) ?? [],
    [detail],
  );
  const previewFields = useMemo(
    () => detail?.fields.filter((field) => field.selected) ?? [],
    [detail],
  );

  async function openPreview(forceRefresh = false) {
    setOpen(true);

    if ((detail && !forceRefresh) || loading) {
      return;
    }

    setLoading(true);

    try {
      const detailResponse = await fetch(`/api/datasets/${encodeURIComponent(dataset.id)}`, {
        cache: "no-store",
      });
      const detailData = (await detailResponse.json()) as DatasetDetailResponse;
      const nextDetail = detailData.item;
      setDetail(nextDetail);

      if (!nextDetail) {
        setPreviewRows([]);
        return;
      }

      const selectedFields = nextDetail.fields.filter((field) => field.selected);

      if (selectedFields.length === 0) {
        setPreviewRows([]);
        return;
      }

      const previewResponse = await fetch(`/api/datasets/${encodeURIComponent(dataset.id)}/query`, {
        body: JSON.stringify({
          dimensions: selectedFields.map((field) => ({
            alias: field.display_name,
            field: field.id || field.display_name,
          })),
          limit: 20,
          measures: [],
          query_type: "table",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const previewData = (await previewResponse.json()) as DatasetPreviewResponse;

      setPreviewRows(previewData.rows ?? []);
    } catch {
      setDetail(null);
      setPreviewRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TooltipProvider delayDuration={100}>
        <div className="flex items-center gap-1 text-muted-foreground">
          <ActionIconButton
            href={`/datasets/create?datasetId=${encodeURIComponent(dataset.id)}`}
            icon={Pencil}
            label="编辑数据集"
          />
          <ActionIconButton icon={Eye} label="数据预览" onClick={openPreview} />
          <ActionIconButton
            href={`/screens?datasetId=${encodeURIComponent(dataset.id)}`}
            icon={FileBarChart}
            label="新建数据大屏"
          />
          <DeleteDatasetButton datasetId={dataset.id} datasetName={dataset.name} />
        </div>
      </TooltipProvider>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[82vh] max-w-6xl gap-0 overflow-hidden p-0" showCloseButton>
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="truncate">{dataset.name}</DialogTitle>
            <DialogDescription>{detail?.updated_at || "-"}</DialogDescription>
          </DialogHeader>

          <Tabs className="min-h-0 min-w-0 flex-1 gap-4 p-5" defaultValue="preview">
            <div className="flex items-center justify-between gap-4">
              <TabsList>
                <TabsTrigger value="fields">字段详情</TabsTrigger>
                <TabsTrigger value="preview">数据预览</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-3">
                <Button
                  disabled={loading}
                  onClick={() => openPreview(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="size-3.5" />
                  {loading ? "刷新中..." : "刷新"}
                </Button>
              </div>
            </div>

            <TabsContent className="min-h-0 min-w-0 max-w-full" value="preview">
              <div className="max-h-[48vh] w-full max-w-full overflow-y-auto overflow-x-auto rounded-lg border border-border [scrollbar-gutter:stable]">
                <Table className="min-w-max">
                  <TableHeader className="sticky top-0 z-10 bg-[#f3f6ff]">
                    <TableRow className="bg-[#f3f6ff] hover:bg-[#f3f6ff]">
                      {previewFields.length > 0 ? (
                        previewFields.map((field) => (
                          <TableHead
                            className="min-w-52 border-r border-border align-top"
                            key={field.display_name}
                          >
                            <span className="grid gap-2 py-2">
                              <span className="truncate text-sm font-normal text-foreground">
                                {field.display_name}
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs font-normal text-muted-foreground">
                                <PreviewFieldTypeIcon type={field.data_type} />
                                {field.data_type}
                              </span>
                            </span>
                          </TableHead>
                        ))
                      ) : (
                        <TableHead>暂无字段</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <EmptyTableRow
                        colSpan={Math.max(previewColumns.length, 1)}
                        text="加载中..."
                      />
                    ) : previewRows.length > 0 ? (
                      previewRows.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {previewColumns.map((column) => (
                            <TableCell
                              className="max-w-72 truncate whitespace-nowrap border-r border-border text-muted-foreground"
                              key={`${rowIndex}-${column}`}
                            >
                              {row[column] || ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <EmptyTableRow
                        colSpan={Math.max(previewColumns.length, 1)}
                        text="暂无预览数据"
                      />
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent className="min-h-0 min-w-0 max-w-full" value="fields">
              <div className="max-h-[48vh] w-full max-w-full overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>源字段</TableHead>
                      <TableHead>字段别名</TableHead>
                      <TableHead>字段类型</TableHead>
                      <TableHead>语义类型</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <EmptyTableRow colSpan={4} text="加载中..." />
                    ) : detail?.fields?.filter((field) => field.selected).length ? (
                      detail.fields
                        .filter((field) => field.selected)
                        .map((field) => (
                          <TableRow key={`${field.source_name}-${field.display_name}`}>
                            <TableCell>{field.source_name}</TableCell>
                            <TableCell>{field.display_name}</TableCell>
                            <TableCell>{field.data_type}</TableCell>
                            <TableCell>{field.semantic_type}</TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <EmptyTableRow colSpan={4} text="暂无字段信息" />
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewFieldTypeIcon({ type }: { type: string }) {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes("date") || normalizedType.includes("time")) {
    return <Clock3 className="size-3.5 text-primary" />;
  }

  if (
    normalizedType.includes("number") ||
    normalizedType.includes("int") ||
    normalizedType.includes("numeric") ||
    normalizedType.includes("decimal") ||
    normalizedType.includes("float")
  ) {
    return <Hash className="size-3.5 text-primary" />;
  }

  return <Type className="size-3.5 text-primary" />;
}

function ActionIconButton({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href?: string;
  icon: typeof BarChart3;
  label: string;
  onClick?: () => void;
}) {
  const button = href ? (
    <Button asChild size="icon-sm" variant="ghost">
      <Link aria-label={label} href={href}>
        <Icon className="size-4" />
      </Link>
    </Button>
  ) : (
    <Button aria-label={label} onClick={onClick} size="icon-sm" type="button" variant="ghost">
      <Icon className="size-4" />
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function EmptyTableRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell className="py-12 text-center text-muted-foreground" colSpan={colSpan}>
        {text}
      </TableCell>
    </TableRow>
  );
}
