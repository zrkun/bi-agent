"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as XLSX from "xlsx";
import { CalendarDays, Hash, Pencil, Plus, Trash2, Type, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FieldType = "date" | "number" | "text";

type LocalFileField = {
  display_name?: string | null;
  name?: string | null;
  source_name?: string | null;
  type: FieldType | string;
};

type LocalFileDetail = {
  display_name: string;
  fields: LocalFileField[];
  file_name: string;
  header_row?: number;
  id: string;
  object_key?: string | null;
  sheet_name: string;
};

type LocalFileDetailResponse = {
  item?: LocalFileDetail | null;
};

type DownloadUrlResponse = {
  download_url: string;
};

type EditableField = {
  displayName: string;
  id: string;
  sourceName: string;
  type: FieldType;
};

type LocalFileActionsProps = {
  displayName: string;
  headerRow: number;
  itemId: string;
};

const fieldTypeOptions: Array<{ label: string; type: FieldType }> = [
  { label: "日期", type: "date" },
  { label: "文本", type: "text" },
  { label: "数值", type: "number" },
];

function formatPreviewCell(value: string | number | Date | null | undefined, fieldType: FieldType) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (fieldType !== "date") {
    return String(value);
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function LocalFileActions({ displayName, headerRow, itemId }: LocalFileActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<LocalFileDetail | null>(null);
  const [editableName, setEditableName] = useState(displayName);
  const [editableHeaderRow, setEditableHeaderRow] = useState(String(headerRow));
  const [fields, setFields] = useState<EditableField[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  async function openEditor() {
    setEditing(true);

    if (detail || loadingDetail) {
      return;
    }

    setLoadingDetail(true);

    try {
      const response = await fetch(`/api/local-files/${encodeURIComponent(itemId)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as LocalFileDetailResponse;

      if (!response.ok || !data.item) {
        window.alert("本地文件配置加载失败。");
        return;
      }

      setDetail(data.item);
      setEditableName(data.item.display_name);
      setEditableHeaderRow(String(data.item.header_row ?? 1));
      setFields(normalizeFields(data.item.fields));
      await loadPreview(data.item);
    } catch {
      window.alert("本地文件配置加载失败：无法请求后端服务。");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function loadPreview(item: LocalFileDetail) {
    if (!item.object_key) {
      return;
    }

    try {
      const response = await fetch("/api/uploads/download-url", {
        body: JSON.stringify({ object_key: item.object_key }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as DownloadUrlResponse;
      const fileResponse = await fetch(data.download_url);

      if (!fileResponse.ok) {
        return;
      }

      const workbook = XLSX.read(await fileResponse.arrayBuffer(), { cellDates: true });
      const sheetName = item.sheet_name
        .replace(item.file_name.replace(/\.[^.]+$/, ""), "")
        .replace(/^-/, "");
      const worksheet = workbook.Sheets[sheetName] ?? workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(worksheet, {
        blankrows: false,
        defval: "",
        header: 1,
        raw: false,
      });

      setPreviewRows(
        rows.slice(Number(item.header_row ?? 1), Number(item.header_row ?? 1) + 20).map((row) => {
          const currentFields = normalizeFields(item.fields);

          return currentFields.map((field, index) => formatPreviewCell(row[index], field.type));
        }),
      );
    } catch {
      setPreviewRows([]);
    }
  }

  async function saveLocalFile() {
    const nextHeaderRow = Number(editableHeaderRow);

    if (!editableName.trim()) {
      window.alert("展示名称不能为空。");
      return;
    }

    if (Number.isNaN(nextHeaderRow) || nextHeaderRow < 1) {
      window.alert("标题行必须是大于 0 的数字。");
      return;
    }

    setPending(true);

    try {
      const response = await fetch(`/api/local-files/${encodeURIComponent(itemId)}`, {
        body: JSON.stringify({
          display_name: editableName.trim(),
          fields: fields.map((field) => ({
            display_name: field.displayName,
            name: field.displayName,
            source_name: field.sourceName,
            type: field.type,
          })),
          header_row: nextHeaderRow,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const data = (await response.json()) as {
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !data.ok) {
        window.alert(data.message || "本地文件配置更新失败。");
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      window.alert("本地文件配置更新失败：无法请求后端服务。");
    } finally {
      setPending(false);
    }
  }

  async function deleteLocalFile() {
    setPending(true);

    try {
      const response = await fetch(`/api/local-files/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !data.ok) {
        window.alert(data.message || "本地文件删除失败。");
        return;
      }

      router.refresh();
    } catch {
      window.alert("本地文件删除失败：无法请求后端服务。");
    } finally {
      setPending(false);
    }
  }

  function updateField(fieldId: string, patch: Partial<EditableField>) {
    setFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    );
  }

  function addField() {
    setFields((currentFields) => [
      ...currentFields,
      {
        displayName: `字段${currentFields.length + 1}`,
        id: `field-${Date.now()}`,
        sourceName: `字段${currentFields.length + 1}`,
        type: "text",
      },
    ]);
  }

  return (
    <>
      <div className="flex justify-end gap-1 text-muted-foreground">
        <Button disabled={pending} onClick={openEditor} size="sm" type="button" variant="ghost">
          <Pencil className="size-3.5" />
          编辑
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={pending} size="sm" type="button" variant="ghost">
              <Trash2 className="size-3.5" />
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除本地文件</AlertDialogTitle>
              <AlertDialogDescription>
                确认删除「{displayName}」吗？这只会删除系统里的文件配置。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
              <AlertDialogAction disabled={pending} onClick={deleteLocalFile}>
                {pending ? "删除中..." : "删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button asChild className="text-primary" disabled={pending} size="sm" variant="link">
          <Link
            href={`/workbench/datasets/create?datasourceId=local-file&table=${encodeURIComponent(itemId)}`}
          >
            创建数据集
          </Link>
        </Button>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 bg-black/30 px-5 py-8">
          <div className="mx-auto flex h-full max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-border bg-[#f3f8fe] px-5">
              <h2 className="text-base font-semibold">修改文件上传</h2>
              <Button
                aria-label="关闭"
                onClick={() => setEditing(false)}
                size="icon"
                variant="ghost"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="grid grid-cols-[120px_minmax(0,340px)_90px_minmax(0,360px)] items-center gap-4 bg-[#f3f8fe] px-5 py-4 text-sm">
              <span>展示名称</span>
              <Input
                value={editableName}
                onChange={(event) => setEditableName(event.target.value)}
              />
              <span>物理表名</span>
              <Input disabled value={detail?.id ?? itemId} />
            </div>

            <Tabs className="min-h-0 flex-1 gap-3 p-4" defaultValue="preview">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="preview">数据预览</TabsTrigger>
                  <TabsTrigger value="fields">字段详情</TabsTrigger>
                </TabsList>
                <Button onClick={addField} size="sm" type="button" variant="outline">
                  <Plus className="size-4" />
                  添加字段
                </Button>
              </div>

              <TabsContent className="min-h-0" value="preview">
                <PreviewTable
                  fields={fields}
                  loading={loadingDetail}
                  rows={previewRows}
                  onUpdateField={updateField}
                />
              </TabsContent>

              <TabsContent className="min-h-0" value="fields">
                <FieldTable
                  fields={fields}
                  loading={loadingDetail}
                  onRemoveField={(fieldId) =>
                    setFields((current) => current.filter((field) => field.id !== fieldId))
                  }
                  onUpdateField={updateField}
                />
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                设置第
                <Input
                  className="h-8 w-16 text-center"
                  value={editableHeaderRow}
                  onChange={(event) => setEditableHeaderRow(event.target.value)}
                />
                行是标题行
              </label>
              <div className="flex gap-2">
                <Button onClick={() => setEditing(false)} type="button" variant="outline">
                  取消
                </Button>
                <Button disabled={pending} onClick={saveLocalFile} type="button">
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PreviewTable({
  fields,
  loading,
  onUpdateField,
  rows,
}: {
  fields: EditableField[];
  loading: boolean;
  onUpdateField: (fieldId: string, patch: Partial<EditableField>) => void;
  rows: string[][];
}) {
  return (
    <div className="max-h-[52vh] overflow-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f6f8fb] hover:bg-[#f6f8fb]">
            {fields.map((field) => (
              <TableHead className="min-w-40" key={field.id}>
                <div className="flex items-center gap-2">
                  <Select
                    value={field.type}
                    onValueChange={(value) => onUpdateField(field.id, { type: value as FieldType })}
                  >
                    <SelectTrigger
                      aria-label={`${field.displayName} 字段类型`}
                      className="h-7 w-8 border-0 bg-transparent p-0 shadow-none [&>svg:last-child]:hidden"
                    >
                      <SelectValue>
                        <FieldTypeIcon type={field.type} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {fieldTypeOptions.map((option) => (
                        <SelectItem key={option.type} value={option.type}>
                          <FieldTypeIcon type={option.type} />
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 bg-white"
                    value={field.displayName}
                    onChange={(event) =>
                      onUpdateField(field.id, { displayName: event.target.value })
                    }
                  />
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <EmptyRow colSpan={Math.max(fields.length, 1)} text="加载中..." />
          ) : rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <TableRow className="even:bg-[#f6f8fb]" key={rowIndex}>
                {fields.map((field, columnIndex) => (
                  <TableCell className="max-w-56 truncate" key={field.id}>
                    {row[columnIndex] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <EmptyRow colSpan={Math.max(fields.length, 1)} text="暂无预览数据" />
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FieldTable({
  fields,
  loading,
  onRemoveField,
  onUpdateField,
}: {
  fields: EditableField[];
  loading: boolean;
  onRemoveField: (fieldId: string) => void;
  onUpdateField: (fieldId: string, patch: Partial<EditableField>) => void;
}) {
  return (
    <div className="max-h-[52vh] overflow-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f6f8fb] hover:bg-[#f6f8fb]">
            <TableHead>源字段</TableHead>
            <TableHead>字段别名</TableHead>
            <TableHead>字段类型</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <EmptyRow colSpan={4} text="加载中..." />
          ) : fields.length > 0 ? (
            fields.map((field) => (
              <TableRow key={field.id}>
                <TableCell>
                  <span className="text-muted-foreground">{field.sourceName}</span>
                </TableCell>
                <TableCell>
                  <Input
                    value={field.displayName}
                    onChange={(event) =>
                      onUpdateField(field.id, { displayName: event.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={field.type}
                    onValueChange={(value) => onUpdateField(field.id, { type: value as FieldType })}
                  >
                    <SelectTrigger className="w-36 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldTypeOptions.map((option) => (
                        <SelectItem key={option.type} value={option.type}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    aria-label={`删除字段 ${field.displayName}`}
                    onClick={() => onRemoveField(field.id)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <EmptyRow colSpan={4} text="暂无字段" />
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FieldTypeIcon({ type }: { type: FieldType }) {
  if (type === "date") {
    return <CalendarDays className="size-4 text-blue-500" />;
  }

  if (type === "number") {
    return <Hash className="size-4 text-emerald-500" />;
  }

  return <Type className="size-4 text-sky-500" />;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell className="py-12 text-center text-muted-foreground" colSpan={colSpan}>
        {text}
      </TableCell>
    </TableRow>
  );
}

function normalizeFields(fields: LocalFileField[]): EditableField[] {
  return fieldsFromDetail(fields).map((name, index) => {
    const field = fields[index];
    const normalizedType = normalizeFieldType(field?.type);

    return {
      displayName: String(field?.display_name || field?.name || name),
      id: `${index}-${name}`,
      sourceName: String(field?.source_name || field?.name || name),
      type: normalizedType,
    };
  });
}

function fieldsFromDetail(fields: LocalFileField[]) {
  return fields.map((field, index) =>
    String(field.source_name || field.name || field.display_name || `字段${index + 1}`),
  );
}

function normalizeFieldType(type: string | undefined): FieldType {
  if (type === "date" || type === "number" || type === "text") {
    return type;
  }

  return "text";
}
