"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
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

type TablePreviewDialogProps = {
  datasourceId: string;
  table: {
    id: string;
    name: string;
  };
};

type TablePreviewResponse = {
  columns: string[];
  fields: Array<{
    description: string;
    name: string;
    type: string;
  }>;
  rows: Array<Record<string, string>>;
};

const emptyPreview: TablePreviewResponse = {
  columns: [],
  fields: [],
  rows: [],
};

export function TablePreviewDialog({ datasourceId, table }: TablePreviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<TablePreviewResponse>(emptyPreview);

  async function loadPreview() {
    setOpen(true);

    if (preview.columns.length > 0 || preview.fields.length > 0 || loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/datasources/${encodeURIComponent(datasourceId)}/tables/${encodeURIComponent(table.id)}/preview`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as TablePreviewResponse;

      setPreview({
        columns: data.columns ?? [],
        fields: data.fields ?? [],
        rows: data.rows ?? [],
      });
    } catch {
      setPreview(emptyPreview);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        aria-label={`查看 ${table.name} 详情`}
        onClick={loadPreview}
        size="icon-sm"
        variant="ghost"
      >
        <Eye className="size-4" />
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          className="flex h-[calc(100dvh-48px)] max-h-none w-[calc(100vw-48px)] max-w-none flex-col gap-0 overflow-hidden p-0"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="truncate">{table.name}</DialogTitle>
            <DialogDescription>数据表预览</DialogDescription>
          </DialogHeader>

          <Tabs className="min-h-0 min-w-0 flex-1 gap-4 p-5" defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">数据预览</TabsTrigger>
              <TabsTrigger value="fields">字段详情</TabsTrigger>
            </TabsList>

            <TabsContent className="min-h-0 min-w-0 max-w-full" value="preview">
              <div className="h-full w-full max-w-full overflow-y-auto overflow-x-auto rounded-lg border border-border [scrollbar-gutter:stable]">
                <Table className="min-w-max">
                  <TableHeader className="sticky top-0 z-10 bg-[#f3f6ff]">
                    <TableRow className="bg-[#f3f6ff] hover:bg-[#f3f6ff]">
                      {preview.columns.length > 0 ? (
                        preview.columns.map((column) => (
                          <TableHead className="min-w-44 border-r border-border" key={column}>
                            {column}
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
                        colSpan={Math.max(preview.columns.length, 1)}
                        text="加载中..."
                      />
                    ) : preview.rows.length > 0 && preview.columns.length > 0 ? (
                      preview.rows.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {preview.columns.map((column) => (
                            <TableCell
                              className="max-w-64 truncate whitespace-nowrap border-r border-border text-muted-foreground"
                              key={column}
                            >
                              {row[column] || ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <EmptyTableRow
                        colSpan={Math.max(preview.columns.length, 1)}
                        text="暂无预览数据"
                      />
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent className="min-h-0 min-w-0 max-w-full" value="fields">
              <div className="h-full w-full max-w-full overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>字段别名({preview.fields.length})</TableHead>
                      <TableHead>字段类型</TableHead>
                      <TableHead>字段描述</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <EmptyTableRow colSpan={3} text="加载中..." />
                    ) : preview.fields.length > 0 ? (
                      preview.fields.map((field) => (
                        <TableRow key={field.name}>
                          <TableCell>{field.name}</TableCell>
                          <TableCell>{field.type}</TableCell>
                          <TableCell>{field.description}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <EmptyTableRow colSpan={3} text="暂无字段信息" />
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

function EmptyTableRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell className="py-12 text-center text-muted-foreground" colSpan={colSpan}>
        {text}
      </TableCell>
    </TableRow>
  );
}
