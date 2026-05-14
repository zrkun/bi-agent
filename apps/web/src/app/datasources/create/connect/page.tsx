"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Hash,
  Lightbulb,
  Inbox,
  Info,
  Library,
  Plus,
  Trash2,
  Type,
  EyeOff,
  RotateCcw,
} from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const parameterTabs = [
  {
    key: "query",
    countable: true,
    label: "普通参数",
    valueLabel: "参数值(VALUE)",
    withInfo: false,
  },
  {
    key: "headers",
    countable: true,
    label: "头参数",
    valueLabel: "参数值(VALUE)",
    withInfo: false,
  },
  { key: "body", label: "请求体", valueLabel: "参数值(VALUE)", withInfo: false },
  { key: "auth", label: "授权验证", valueLabel: "认证值(VALUE)", withInfo: false },
] as const;

type ParameterTabKey = Exclude<(typeof parameterTabs)[number]["key"], "body">;
type ActiveParameterTabKey = (typeof parameterTabs)[number]["key"];
type ParameterRow = {
  id: number;
  key: string;
  value: string;
};
type ParameterRows = Record<ParameterTabKey, ParameterRow[]>;
type BodyType = "json" | "form";
type FieldType = "date" | "number" | "text";
type ParsedSheet = {
  fields: Array<{ key: string; label: string; type: FieldType }>;
  key: string;
  name: string;
  rows: string[][];
  sourceRows: string[][];
};
type NetworkWhitelistResponse = {
  items: string[];
};
type MessageNotice = {
  text: string;
  type: "error" | "loading" | "success";
};
type TestConnectionResponse = {
  message: string;
  ok: boolean;
};
type CreateDatasourceResponse = {
  datasource?: {
    id: string;
  };
  message: string;
  ok: boolean;
};
type CreateLocalFilesResponse = {
  message: string;
  ok: boolean;
};
type CreateUploadUrlResponse = {
  bucket: string;
  object_key: string;
  upload_url: string;
};
type DatasourceDetailResponse = {
  datasource?: {
    database?: string | null;
    host?: string | null;
    id: string;
    name: string;
    password?: string | null;
    port?: number | null;
    schema?: string | null;
    ssl?: boolean | null;
    type: string;
    username?: string | null;
  } | null;
};

const fieldTypeOptions: Array<{ label: string; type: FieldType }> = [
  { label: "文本", type: "text" },
  { label: "数值", type: "number" },
  { label: "日期", type: "date" },
];

function parseQueryRowsFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url, "http://local.api");

    return Array.from(parsedUrl.searchParams.entries()).map(([key, value], index) => ({
      id: Date.now() + index,
      key,
      value,
    }));
  } catch {
    return [];
  }
}

function detectFieldType(values: string[]): FieldType {
  const filledValues = values.filter((value) => value.trim().length > 0);

  if (filledValues.length === 0) {
    return "text";
  }

  const dateCount = filledValues.filter((value) => !Number.isNaN(Date.parse(value))).length;
  const numberCount = filledValues.filter((value) => !Number.isNaN(Number(value))).length;

  if (dateCount / filledValues.length >= 0.7) {
    return "date";
  }

  if (numberCount / filledValues.length >= 0.7) {
    return "number";
  }

  return "text";
}

function formatCellValue(value: string, fieldType: FieldType) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  if (fieldType === "number") {
    const numericValue = Number(trimmedValue.replaceAll(",", ""));

    return Number.isNaN(numericValue) ? value : String(numericValue);
  }

  if (fieldType === "date") {
    const timestamp = Date.parse(trimmedValue);

    if (Number.isNaN(timestamp)) {
      return value;
    }

    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const hasTime = hours !== "00" || minutes !== "00" || seconds !== "00";

    return hasTime
      ? `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
      : `${year}-${month}-${day}`;
  }

  return value;
}

function formatRowsByFields(rows: string[][], fields: ParsedSheet["fields"]) {
  return rows.map((row) =>
    fields.map((field, columnIndex) => formatCellValue(row[columnIndex] ?? "", field.type)),
  );
}

async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { cellDates: true });
  const fallbackName = file.name.replace(/\.[^.]+$/, "");
  const sheetNames = workbook.SheetNames.slice(0, 5);

  return sheetNames.map((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | Date | null>>(worksheet, {
      blankrows: false,
      defval: "",
      header: 1,
      raw: false,
    });
    const headerRow = rows[0] ?? [];
    const bodyRows = rows.slice(1, 101);
    const columnCount = Math.max(headerRow.length, ...bodyRows.map((row) => row.length), 1);
    const normalizedRows = bodyRows.map((row) =>
      Array.from({ length: columnCount }, (_, index) => String(row[index] ?? "")),
    );
    const fields = Array.from({ length: columnCount }, (_, index) => {
      const label = String(headerRow[index] || `字段${index + 1}`);
      const columnValues = normalizedRows.map((row) => row[index] ?? "");

      return {
        key: `${sheetIndex}-${index}-${label}`,
        label,
        type: detectFieldType(columnValues),
      };
    });

    const parsedFields = fields;

    return {
      fields: parsedFields,
      key: `${sheetIndex}-${sheetName}`,
      name: sheetNames.length === 1 ? fallbackName : `${fallbackName}-${sheetName}`,
      rows: formatRowsByFields(normalizedRows, parsedFields),
      sourceRows: normalizedRows,
    };
  });
}

export default function ConnectDatasourcePage() {
  return (
    <Suspense fallback={null}>
      <ConnectDatasourceContent />
    </Suspense>
  );
}

function getDatasourceTypeName(type: string) {
  const labels: Record<string, string> = {
    api: "API数据源",
    clickhouse: "ClickHouse",
    "local-file": "本地文件",
    mongodb: "MongoDB",
    mysql: "MySQL",
    oracle: "Oracle",
    postgresql: "PostgreSQL",
    sqlserver: "SQL Server",
  };

  return labels[type] ?? type;
}

function ConnectDatasourceContent() {
  const searchParams = useSearchParams();
  const datasourceType = searchParams.get("type") ?? "api";
  const datasourceName = searchParams.get("name") ?? getDatasourceTypeName(datasourceType);
  const datasourceId = searchParams.get("datasourceId");
  const isFileDatasource = datasourceType === "local-file";
  const isApiDatasource = datasourceType === "api";
  const isDatabaseDatasource = !isFileDatasource && !isApiDatasource;
  const [canGoNext, setCanGoNext] = useState(false);
  const [fileUploaded, setFileUploaded] = useState(false);
  const databaseConnectionTesterRef = useRef<(() => void) | null>(null);
  const databaseDatasourceCreatorRef = useRef<(() => void) | null>(null);
  const localFileSaverRef = useRef<(() => void) | null>(null);

  return (
    <>
      <div className="flex h-16 items-center justify-between">
        <Link
          className="inline-flex items-center gap-2 text-base font-semibold transition-colors hover:text-primary"
          href="/datasources/create"
        >
          <ArrowLeft className="size-5" />
          新建数据源
        </Link>
        <div />
      </div>

      <div className="mx-auto flex max-w-3xl items-center justify-center gap-6 text-sm">
        {["选择数据源", "配置连接", "完成"].map((item, index) => (
          <div className="flex items-center gap-3" key={item}>
            <span
              className={
                index <= 1
                  ? "flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                  : "flex size-7 items-center justify-center rounded-full bg-white text-xs text-muted-foreground"
              }
            >
              {index + 1}
            </span>
            <span className={index === 1 ? "font-medium" : "text-muted-foreground"}>{item}</span>
            {index < 2 ? <span className="h-px w-24 bg-border" /> : null}
          </div>
        ))}
      </div>

      <section
        className={
          isDatabaseDatasource
            ? "mt-8 overflow-hidden rounded-2xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
            : "mt-8 rounded-3xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
        }
      >
        <div
          className={
            isDatabaseDatasource
              ? "flex h-14 items-center justify-between border-b border-black/10 px-6"
              : "flex items-center justify-between border-b border-black/5 px-8 py-5"
          }
        >
          <h2
            className={isDatabaseDatasource ? "text-base font-semibold" : "text-lg font-semibold"}
          >
            {isDatabaseDatasource ? `自建数据库 - ${datasourceName}` : datasourceName}
          </h2>
          {isDatabaseDatasource ? (
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                type="button"
              >
                <CircleHelp className="size-4" />
                常见问题
              </button>
              <button
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                type="button"
              >
                <Library className="size-4" />
                帮助文档
              </button>
            </div>
          ) : isFileDatasource ? (
            <FileUploadSteps previewActive={fileUploaded} />
          ) : (
            <ApiConnectSteps />
          )}
          {isDatabaseDatasource || isFileDatasource ? (
            <div className={isDatabaseDatasource ? "hidden" : "w-20"} />
          ) : (
            <Button variant="link">查看帮助</Button>
          )}
        </div>

        {isFileDatasource ? (
          <FileUploadContent
            onRegisterFileSaver={(saver) => {
              localFileSaverRef.current = saver;
            }}
            onValidChange={(isValid) => {
              setCanGoNext(isValid);
              setFileUploaded(isValid);
            }}
          />
        ) : isApiDatasource ? (
          <ApiConnectContent onValidChange={setCanGoNext} />
        ) : (
          <DatabaseConnectContent
            datasourceId={datasourceId}
            datasourceName={datasourceName}
            datasourceType={datasourceType}
            onRegisterDatasourceCreator={(creator) => {
              databaseDatasourceCreatorRef.current = creator;
            }}
            onRegisterConnectionTester={(tester) => {
              databaseConnectionTesterRef.current = tester;
            }}
            onValidChange={setCanGoNext}
          />
        )}

        {isFileDatasource && !fileUploaded ? null : (
          <div
            className={
              isDatabaseDatasource
                ? "flex justify-end gap-3 border-t border-black/10 bg-white px-6 py-3"
                : "flex justify-end gap-3 border-t border-black/5 px-8 py-4"
            }
          >
            {isFileDatasource ? null : (
              <>
                <Button asChild variant="outline">
                  <Link href="/datasources/create">取消</Link>
                </Button>
                <Button
                  disabled={!isDatabaseDatasource}
                  onClick={() => databaseConnectionTesterRef.current?.()}
                  type="button"
                  variant="outline"
                >
                  连接测试
                </Button>
              </>
            )}
            {canGoNext && isDatabaseDatasource ? (
              <Button onClick={() => databaseDatasourceCreatorRef.current?.()} type="button">
                确定
              </Button>
            ) : canGoNext && isFileDatasource ? (
              <Button onClick={() => localFileSaverRef.current?.()} type="button">
                下一步
              </Button>
            ) : canGoNext ? (
              <Button asChild>
                <Link
                  className="text-#fff!"
                  href={`/datasources/create/complete?type=${encodeURIComponent(datasourceType)}&name=${encodeURIComponent(datasourceName)}`}
                >
                  下一步
                </Link>
              </Button>
            ) : (
              <Button disabled type="button">
                {isDatabaseDatasource ? "确定" : "下一步"}
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function DatabaseConnectContent({
  datasourceId,
  datasourceName,
  datasourceType,
  onRegisterDatasourceCreator,
  onRegisterConnectionTester,
  onValidChange,
}: {
  datasourceId: string | null;
  datasourceName: string;
  datasourceType: string;
  onRegisterDatasourceCreator: (creator: () => void) => void;
  onRegisterConnectionTester: (tester: () => void) => void;
  onValidChange: (isValid: boolean) => void;
}) {
  const router = useRouter();
  const defaultPort =
    datasourceType === "postgresql" ? "5432" : datasourceType === "mysql" ? "3306" : "";
  const defaultSchema = datasourceType === "postgresql" ? "public" : "";
  const [displayName, setDisplayName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(defaultPort);
  const [database, setDatabase] = useState("");
  const [schema, setSchema] = useState(defaultSchema);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sslEnabled, setSslEnabled] = useState(false);
  const [whitelistItems, setWhitelistItems] = useState<string[]>(["127.0.0.1"]);
  const [whitelistCopied, setWhitelistCopied] = useState(false);
  const [messageNotice, setMessageNotice] = useState<MessageNotice | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const supportText =
    datasourceType === "postgresql"
      ? "提示：支持PostgreSQL 8.2及以上版本"
      : `提示：请确认 ${datasourceName} 数据库网络可访问`;

  useEffect(() => {
    if (!datasourceId) {
      return;
    }

    let isMounted = true;
    const activeDatasourceId = datasourceId;

    async function loadDatasourceDetail() {
      try {
        const response = await fetch(`/api/datasources/${encodeURIComponent(activeDatasourceId)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as DatasourceDetailResponse;
        const datasource = data.datasource;

        if (!isMounted || !datasource) {
          return;
        }

        setDisplayName(datasource.name ?? "");
        setHost(datasource.host ?? "");
        setPort(datasource.port ? String(datasource.port) : defaultPort);
        setDatabase(datasource.database ?? "");
        setSchema(datasource.schema ?? defaultSchema);
        setUsername(datasource.username ?? "");
        setPassword(datasource.password ?? "");
        setSslEnabled(Boolean(datasource.ssl));
      } catch {
        showMessage("error", "数据源详情加载失败。");
      }
    }

    loadDatasourceDetail();

    return () => {
      isMounted = false;
    };
  }, [datasourceId, defaultPort, defaultSchema]);

  useEffect(() => {
    onValidChange(
      displayName.trim().length > 0 &&
        host.trim().length > 0 &&
        port.trim().length > 0 &&
        database.trim().length > 0 &&
        username.trim().length > 0 &&
        password.trim().length > 0,
    );
  }, [database, displayName, host, onValidChange, password, port, username]);

  useEffect(() => {
    onRegisterConnectionTester(testConnection);
  });

  useEffect(() => {
    onRegisterDatasourceCreator(createDatasource);
  });

  useEffect(() => {
    let isMounted = true;

    async function loadWhitelist() {
      try {
        const response = await fetch("/api/network/whitelist", { cache: "no-store" });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as NetworkWhitelistResponse;
        const items = data.items.filter((item) => item.trim().length > 0);

        if (isMounted && items.length > 0) {
          setWhitelistItems(items);
        }
      } catch {
        // Keep the local development fallback when the API is not available.
      }
    }

    loadWhitelist();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  function showMessage(type: MessageNotice["type"], text: string, duration = 2200) {
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }

    setMessageNotice({ text, type });

    if (duration > 0) {
      messageTimerRef.current = window.setTimeout(() => {
        setMessageNotice(null);
        messageTimerRef.current = null;
      }, duration);
    }
  }

  async function copyWhitelist() {
    const whitelistText = whitelistItems.join(",");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(whitelistText);
      } else {
        copyTextWithTextarea(whitelistText);
      }

      setWhitelistCopied(true);
      window.setTimeout(() => setWhitelistCopied(false), 1800);
    } catch {
      copyTextWithTextarea(whitelistText);
      setWhitelistCopied(true);
      window.setTimeout(() => setWhitelistCopied(false), 1800);
    }
  }

  async function testConnection() {
    const trimmedPort = Number(port);

    if (
      host.trim().length === 0 ||
      database.trim().length === 0 ||
      username.trim().length === 0 ||
      password.trim().length === 0 ||
      Number.isNaN(trimmedPort)
    ) {
      showMessage("error", "请先填写数据库地址、端口、数据库、用户名和密码。");
      return;
    }

    showMessage("loading", "正在测试连接...", 0);

    try {
      const response = await fetch("/api/datasources/test-connection", {
        body: JSON.stringify({
          database: database.trim(),
          host: host.trim(),
          password,
          port: trimmedPort,
          schema_name: schema.trim() || undefined,
          ssl: sslEnabled,
          type: datasourceType,
          username: username.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as TestConnectionResponse;

      showMessage(response.ok && data.ok ? "success" : "error", data.message);
    } catch {
      showMessage("error", "连接测试失败：无法请求后端服务。");
    }
  }

  async function createDatasource() {
    const trimmedPort = Number(port);

    if (
      displayName.trim().length === 0 ||
      host.trim().length === 0 ||
      database.trim().length === 0 ||
      username.trim().length === 0 ||
      password.trim().length === 0 ||
      Number.isNaN(trimmedPort)
    ) {
      showMessage("error", "请先填写显示名称、数据库地址、端口、数据库、用户名和密码。");
      return;
    }

    const isEditing = Boolean(datasourceId);

    showMessage("loading", isEditing ? "正在更新数据源..." : "正在创建数据源...", 0);

    try {
      const response = await fetch(
        isEditing
          ? `/api/datasources/${encodeURIComponent(datasourceId ?? "")}`
          : "/api/datasources",
        {
          body: JSON.stringify({
            database: database.trim(),
            display_name: displayName.trim(),
            host: host.trim(),
            password,
            port: trimmedPort,
            schema_name: schema.trim() || undefined,
            ssl: sslEnabled,
            type: datasourceType,
            username: username.trim(),
          }),
          headers: { "Content-Type": "application/json" },
          method: isEditing ? "PUT" : "POST",
        },
      );
      const data = (await response.json()) as CreateDatasourceResponse;

      if (!response.ok || !data.ok || !data.datasource?.id) {
        showMessage("error", data.message || (isEditing ? "数据源更新失败。" : "数据源创建失败。"));
        return;
      }

      showMessage(
        "success",
        data.message || (isEditing ? "数据源更新成功。" : "数据源创建成功。"),
        900,
      );
      window.setTimeout(() => {
        router.push(`/datasources?activeDatasourceId=${data.datasource?.id}`);
      }, 700);
    } catch {
      showMessage(
        "error",
        isEditing ? "数据源更新失败：无法请求后端服务。" : "数据源创建失败：无法请求后端服务。",
      );
    }
  }

  return (
    <div className="grid min-h-[620px] grid-cols-[minmax(560px,720px)_1fr]">
      {messageNotice ? <MessageNotice notice={messageNotice} /> : null}
      <div className="border-r border-black/10 px-7 py-5">
        <div className="mb-5 flex h-8 items-center gap-2 rounded bg-muted px-3 text-sm text-muted-foreground">
          <Lightbulb className="size-4 text-primary" />
          {supportText}
        </div>

        <div className="grid gap-4">
          <DatabaseTextField
            label="显示名称"
            onChange={setDisplayName}
            placeholder="数据源配置列表显示名称"
            required
            value={displayName}
          />
          <DatabaseTextField
            label="数据库地址"
            onChange={setHost}
            placeholder="数据库地址"
            required
            value={host}
          />
          <DatabaseTextField label="端口" onChange={setPort} required value={port} />
          <DatabaseTextField
            label="数据库"
            onChange={setDatabase}
            placeholder="数据库名称"
            required
            value={database}
          />
          <DatabaseTextField label="Schema" onChange={setSchema} value={schema} />
          <DatabaseTextField
            autoComplete="off"
            label="用户名"
            onChange={setUsername}
            placeholder="请输入用户名"
            required
            value={username}
          />
          <DatabaseTextField
            autoComplete="new-password"
            label="密码"
            onChange={setPassword}
            placeholder="请输入密码"
            required
            type="password"
            value={password}
          />
          <DatabaseSwitch checked={sslEnabled} label="SSL" onCheckedChange={setSslEnabled} />
          <div className="grid grid-cols-[220px_1fr] gap-4 pt-2 text-sm">
            <div className="pl-8">白名单列表</div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">连接前，请添加如下白名单列表。</p>
              <div className="rounded border border-black/15 bg-[#f4f6f9] px-3 py-3 font-mono text-xs leading-6 text-muted-foreground">
                {whitelistItems.join(",")}
              </div>
              <button
                className="mt-2 text-xs font-medium text-primary hover:text-primary/80"
                onClick={copyWhitelist}
                type="button"
              >
                {whitelistCopied ? "已复制" : "复制白名单"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside className="px-7 py-6 text-sm text-muted-foreground">
        <p>数据源配置列表的显示名称。请输入规范的名称，不要使用特殊字符，前后不能包含空格。</p>
      </aside>
    </div>
  );
}

function MessageNotice({ notice }: { notice: MessageNotice }) {
  return (
    <div className="pointer-events-none fixed top-16 left-1/2 z-50 -translate-x-1/2">
      <div
        className={
          notice.type === "success"
            ? "rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
            : notice.type === "loading"
              ? "rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
              : "rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-destructive shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
        }
      >
        {notice.text}
      </div>
    </div>
  );
}

function copyTextWithTextarea(value: string) {
  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function DatabaseTextField({
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
  autoComplete,
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "password" | "text";
  value: string;
}) {
  return (
    <label className="grid grid-cols-[220px_1fr] items-center gap-4 text-sm">
      <span className="pl-8">
        {required ? <span className="mr-0.5 text-destructive">*</span> : null}
        {label}
      </span>
      <span className="relative">
        <Input
          autoComplete={autoComplete}
          className="h-8 rounded border-black/15 bg-white text-sm shadow-none focus-visible:ring-0"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
        {type === "password" ? (
          <EyeOff className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        ) : null}
      </span>
    </label>
  );
}

function DatabaseSwitch({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[220px_1fr] items-center gap-4 text-sm">
      <div className="pl-8">
        <div>{label}</div>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <button
        aria-checked={checked}
        className={
          checked
            ? "relative h-5 w-9 rounded-full bg-primary transition-colors"
            : "relative h-5 w-9 rounded-full bg-black/25 transition-colors"
        }
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={
            checked
              ? "absolute top-0.5 left-5 size-4 rounded-full bg-white transition-all"
              : "absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-all"
          }
        />
      </button>
    </div>
  );
}

function ApiConnectContent({ onValidChange }: { onValidChange: (isValid: boolean) => void }) {
  const [activeParameterTab, setActiveParameterTab] = useState<ActiveParameterTabKey>("headers");
  const [connectionName, setConnectionName] = useState("");
  const [requestMethod, setRequestMethod] = useState<"GET" | "POST">("GET");
  const [apiUrl, setApiUrl] = useState("");
  const [bodyType, setBodyType] = useState<BodyType>("json");
  const [jsonBody, setJsonBody] = useState("{\n  \n}");
  const [bodyFormRows, setBodyFormRows] = useState<ParameterRow[]>([]);
  const [parameterRows, setParameterRows] = useState<ParameterRows>({
    auth: [],
    headers: [
      { id: 1, key: "Content-Type", value: "application/json" },
      { id: 2, key: "Connection", value: "keep-alive" },
    ],
    query: [],
  });
  const activeTab = parameterTabs.find((tab) => tab.key === activeParameterTab) ?? parameterTabs[0];
  const activeRows = activeParameterTab === "body" ? [] : parameterRows[activeParameterTab];

  useEffect(() => {
    onValidChange(connectionName.trim().length > 0 && apiUrl.trim().length > 0);
  }, [apiUrl, connectionName, onValidChange]);

  function syncQueryRowsFromUrl(url: string) {
    setParameterRows((currentRows) => ({
      ...currentRows,
      query: parseQueryRowsFromUrl(url),
    }));
  }

  function handleApiUrlChange(value: string) {
    setApiUrl(value);

    if (requestMethod === "GET") {
      syncQueryRowsFromUrl(value);
    }
  }

  function handleRequestMethodChange(method: "GET" | "POST") {
    setRequestMethod(method);

    if (method === "GET") {
      syncQueryRowsFromUrl(apiUrl);
      setActiveParameterTab("query");
      return;
    }

    setActiveParameterTab("body");
  }

  function addParameterRow() {
    if (activeParameterTab === "body") {
      return;
    }

    setParameterRows((currentRows) => ({
      ...currentRows,
      [activeParameterTab]: [
        ...currentRows[activeParameterTab],
        { id: Date.now(), key: "", value: "" },
      ],
    }));
  }

  function removeParameterRow(rowId: number) {
    if (activeParameterTab === "body") {
      return;
    }

    setParameterRows((currentRows) => ({
      ...currentRows,
      [activeParameterTab]: currentRows[activeParameterTab].filter((row) => row.id !== rowId),
    }));
  }

  function addBodyFormRow() {
    setBodyFormRows((currentRows) => [...currentRows, { id: Date.now(), key: "", value: "" }]);
  }

  function removeBodyFormRow(rowId: number) {
    setBodyFormRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
  }

  return (
    <div className="grid gap-8 p-8">
      <FormSection title="基础认证">
        <RequiredInput label="连接名称" onChange={setConnectionName} value={connectionName} />
        <RequiredInput label="接口地址" onChange={handleApiUrlChange} value={apiUrl} />
        <div className="grid grid-cols-[90px_1fr] items-center gap-4">
          <div className="text-sm">
            <span className="text-destructive">*</span> 请求类型
          </div>
          <div className="flex items-center gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={requestMethod === "GET"}
                name="method"
                onChange={() => handleRequestMethodChange("GET")}
                type="radio"
                value="GET"
              />
              GET
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={requestMethod === "POST"}
                name="method"
                onChange={() => handleRequestMethodChange("POST")}
                type="radio"
                value="POST"
              />
              POST
            </label>
          </div>
        </div>
      </FormSection>

      <FormSection title="连接设置">
        <div className="grid grid-cols-[90px_1fr] items-center gap-4">
          <div className="text-sm">
            <span className="text-destructive">*</span> 连接方式
          </div>
          <div className="flex items-center gap-3 text-sm">
            <input defaultValue="direct" name="mode" type="hidden" />
            <span className="inline-flex h-8 items-center rounded-md bg-primary/10 px-3 font-medium text-primary">
              直连
            </span>
            <span className="text-muted-foreground">
              请求时实时调用接口，适合数据量较小、实时性要求高的场景。
            </span>
          </div>
        </div>
      </FormSection>

      <FormSection title="参数设置">
        <div>
          <div className="flex items-center justify-between border-b border-black/5">
            <div className="flex gap-8 text-sm">
              {parameterTabs.map((tab) =>
                tab.key === "body" && requestMethod !== "POST" ? null : (
                  <button
                    className={
                      activeParameterTab === tab.key
                        ? "relative h-10 font-medium text-foreground after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-primary"
                        : "h-10 text-muted-foreground transition-colors hover:text-foreground"
                    }
                    key={tab.key}
                    onClick={() => setActiveParameterTab(tab.key)}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-1">
                      {tab.label}
                      {"countable" in tab ? `(${parameterRows[tab.key].length})` : null}
                      {"withInfo" in tab && tab.withInfo ? <Info className="size-3.5" /> : null}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>

          {activeParameterTab === "body" ? (
            <div className="bg-white pt-3">
              <div className="mb-3 flex items-center gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    checked={bodyType === "json"}
                    name="bodyType"
                    onChange={() => setBodyType("json")}
                    type="radio"
                    value="json"
                  />
                  JSON
                </label>
                <label className="flex items-center gap-2">
                  <input
                    checked={bodyType === "form"}
                    name="bodyType"
                    onChange={() => setBodyType("form")}
                    type="radio"
                    value="form"
                  />
                  x-www-form-urlencoded
                </label>
              </div>
              {bodyType === "json" ? (
                <div className="overflow-hidden rounded-md border border-black/10 bg-white">
                  <MonacoEditor
                    defaultLanguage="json"
                    height="288px"
                    onChange={(value) => setJsonBody(value ?? "")}
                    options={{
                      automaticLayout: true,
                      contextmenu: false,
                      folding: false,
                      fontFamily:
                        "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 13,
                      lineDecorationsWidth: 8,
                      lineNumbersMinChars: 3,
                      minimap: { enabled: false },
                      overviewRulerLanes: 0,
                      padding: { bottom: 12, top: 8 },
                      renderLineHighlight: "none",
                      scrollBeyondLastLine: false,
                    }}
                    theme="vs"
                    value={jsonBody}
                  />
                  <input name="body.json" type="hidden" value={jsonBody} />
                </div>
              ) : (
                <div className="overflow-hidden bg-white">
                  <div className="grid grid-cols-[36px_1fr_1fr_160px] border-b border-black/5 px-3 py-4 text-sm text-muted-foreground">
                    <span />
                    <span>参数名称(KEY)</span>
                    <span>参数值(VALUE)</span>
                    <span>操作</span>
                  </div>
                  {bodyFormRows.length > 0 ? (
                    <div className="divide-y divide-black/5">
                      {bodyFormRows.map((row, index) => (
                        <div
                          className="grid grid-cols-[36px_1fr_1fr_160px] items-center gap-4 px-3 py-3"
                          key={row.id}
                        >
                          <input className="size-4 accent-primary" defaultChecked type="checkbox" />
                          <Input
                            aria-label="请求体参数名称"
                            className="h-9 rounded-md bg-white"
                            defaultValue={row.key}
                            name={`body.form[${index}].key`}
                            placeholder="请输入参数名称"
                          />
                          <Input
                            aria-label="请求体参数值"
                            className="h-9 rounded-md bg-white"
                            defaultValue={row.value}
                            name={`body.form[${index}].value`}
                            placeholder="请输入参数值"
                          />
                          <Button
                            className="w-fit gap-1.5 text-muted-foreground hover:text-destructive"
                            onClick={() => removeBodyFormRow(row.id)}
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" />
                            删除
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center text-sm text-muted-foreground">
                      <Inbox className="mb-3 size-10 stroke-[1.4] text-muted-foreground/30" />
                      暂无数据
                    </div>
                  )}
                  <button
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80"
                    onClick={addBodyFormRow}
                    type="button"
                  >
                    <Plus className="size-4" />
                    添加参数
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-hidden bg-white">
              <div className="grid grid-cols-[36px_1fr_1fr_160px] border-b border-black/5 px-3 py-4 text-sm text-muted-foreground">
                <span />
                <span>参数名称(KEY)</span>
                <span className="inline-flex items-center gap-1">
                  {activeTab.valueLabel}
                  <Info className="size-3.5" />
                </span>
                <span>操作</span>
              </div>
              {activeRows.length > 0 ? (
                <div className="divide-y divide-black/5">
                  {activeRows.map((row, index) => (
                    <div
                      className="grid grid-cols-[36px_1fr_1fr_160px] items-center gap-4 px-3 py-3"
                      key={row.id}
                    >
                      <input className="size-4 accent-primary" defaultChecked type="checkbox" />
                      <Input
                        aria-label="参数名称"
                        className="h-9 rounded-md bg-white"
                        defaultValue={row.key}
                        name={`${activeParameterTab}[${index}].key`}
                        placeholder="请输入参数名称"
                      />
                      <Input
                        aria-label="参数值"
                        className="h-9 rounded-md bg-white"
                        defaultValue={row.value}
                        name={`${activeParameterTab}[${index}].value`}
                        placeholder="请输入参数值"
                      />
                      <Button
                        className="w-fit gap-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => removeParameterRow(row.id)}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                      <input
                        name={`${activeParameterTab}[${index}].type`}
                        type="hidden"
                        value={activeParameterTab}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center text-sm text-muted-foreground">
                  <Inbox className="mb-3 size-10 stroke-[1.4] text-muted-foreground/30" />
                  暂无数据
                </div>
              )}
              <button
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80"
                onClick={addParameterRow}
                type="button"
              >
                <Plus className="size-4" />
                添加参数
              </button>
            </div>
          )}
        </div>
      </FormSection>
    </div>
  );
}

function FileUploadContent({
  onRegisterFileSaver,
  onValidChange,
}: {
  onRegisterFileSaver: (saver: () => void) => void;
  onValidChange: (isValid: boolean) => void;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [selectedSheetKeys, setSelectedSheetKeys] = useState<string[]>([]);
  const [activePreviewTab, setActivePreviewTab] = useState<"detail" | "preview">("preview");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [messageNotice, setMessageNotice] = useState<MessageNotice | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const displayName = fileName.replace(/\.[^.]+$/, "") || "测试表格";
  const activeSheetData =
    parsedSheets.find((sheet) => sheet.key === activeSheet) ?? parsedSheets[0];
  const fields = activeSheetData?.fields ?? [];
  const previewRows = activeSheetData?.rows ?? [];
  const activeSheetName = activeSheetData?.name ?? displayName;
  const tips = [
    "请上传结构化数据，以便于我们更好的识别。有合并单元格的，请处理/拆分后再上传",
    "系统会默认将文件首行作为标题行，第二行开始识别为要上传的数据",
    "最大支持上传的单个文件大小不超过50M",
    "最多支持5个Sheet的解析和上传，若您需要上传超过5个Sheet的内容，请拆分为多个Excel文件分别上传",
    "建议使用Chrome浏览器上传",
  ];

  useEffect(() => {
    onValidChange(
      Boolean(
        uploadedFile &&
        parsedSheets.length > 0 &&
        selectedSheetKeys.length > 0 &&
        !parsing &&
        !parseError,
      ),
    );
  }, [
    parseError,
    parsedSheets.length,
    parsing,
    selectedSheetKeys.length,
    uploadedFile,
    onValidChange,
  ]);

  useEffect(() => {
    onRegisterFileSaver(saveLocalFiles);
  });

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  function showMessage(type: MessageNotice["type"], text: string, duration = 2200) {
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }

    setMessageNotice({ text, type });

    if (duration > 0) {
      messageTimerRef.current = window.setTimeout(() => {
        setMessageNotice(null);
        messageTimerRef.current = null;
      }, duration);
    }
  }

  async function saveLocalFiles() {
    const selectedSheets = parsedSheets.filter((sheet) => selectedSheetKeys.includes(sheet.key));
    const selectedSheetNames = selectedSheets.map((sheet) => sheet.name.trim());
    const duplicatedSheetName = selectedSheetNames.find(
      (sheetName, index) => sheetName && selectedSheetNames.indexOf(sheetName) !== index,
    );

    if (!fileName || !uploadedFile || selectedSheets.length === 0) {
      showMessage("error", "请先上传并解析文件。");
      return;
    }

    if (duplicatedSheetName) {
      showMessage("error", `表名称不能重复：${duplicatedSheetName}。`);
      return;
    }

    showMessage("loading", "正在保存本地文件...", 0);

    try {
      const uploadUrlResponse = await fetch("/api/uploads/presigned-url", {
        body: JSON.stringify({
          content_type: uploadedFile.type || "application/octet-stream",
          filename: uploadedFile.name,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!uploadUrlResponse.ok) {
        showMessage("error", "文件存储服务不可用，请检查 MinIO。");
        return;
      }

      const uploadData = (await uploadUrlResponse.json()) as CreateUploadUrlResponse;
      const uploadResponse = await fetch(uploadData.upload_url, {
        body: uploadedFile,
        headers: { "Content-Type": uploadedFile.type || "application/octet-stream" },
        method: "PUT",
      });

      if (!uploadResponse.ok) {
        showMessage("error", "文件上传到 MinIO 失败。");
        return;
      }

      const response = await fetch("/api/local-files", {
        body: JSON.stringify({
          bucket: uploadData.bucket,
          content_type: uploadedFile.type || "application/octet-stream",
          file_name: fileName,
          file_size: uploadedFile.size,
          object_key: uploadData.object_key,
          sheets: selectedSheets.map((sheet) => ({
            display_name: sheet.name,
            fields: sheet.fields.map((field) => ({
              display_name: field.label,
              name: field.label,
              source_name: field.label,
              type: field.type,
            })),
            header_row: 1,
            sheet_name: sheet.name,
          })),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as CreateLocalFilesResponse;

      if (!response.ok || !data.ok) {
        showMessage("error", data.message || "本地文件保存失败。");
        return;
      }

      showMessage("success", data.message || "本地文件保存成功。", 900);
      window.setTimeout(() => {
        router.push("/datasources?activeDatasourceId=local-file");
      }, 700);
    } catch {
      showMessage("error", "本地文件保存失败：无法请求后端服务。");
    }
  }

  function changeFieldType(fieldKey: string, fieldType: FieldType) {
    setParsedSheets((currentSheets) =>
      currentSheets.map((sheet) => {
        if (sheet.key !== activeSheet) {
          return sheet;
        }

        const nextFields = sheet.fields.map((field) =>
          field.key === fieldKey ? { ...field, type: fieldType } : field,
        );

        return {
          ...sheet,
          fields: nextFields,
          rows: formatRowsByFields(sheet.sourceRows, nextFields),
        };
      }),
    );
  }

  async function handleFileChange(file: File | null) {
    if (!file) {
      resetUpload();
      return;
    }

    const supportedExtensions = [".csv", ".xlsx", ".xls"];
    const lowerFileName = file.name.toLowerCase();
    const supported = supportedExtensions.some((extension) => lowerFileName.endsWith(extension));
    const maxSize = 50 * 1024 * 1024;

    if (!supported) {
      resetUpload();
      setParseError("文件只支持 .csv、.xlsx、.xls 格式。");
      return;
    }

    if (file.size > maxSize) {
      resetUpload();
      setParseError("单个文件大小不能超过 50M。");
      return;
    }

    setFileName(file.name);
    setUploadedFile(file);
    setParsedSheets([]);
    setActiveSheet("");
    setActivePreviewTab("preview");
    setParseError("");
    setParsing(true);

    try {
      const sheets = await parseWorkbook(file);

      if (sheets.length === 0) {
        throw new Error("empty workbook");
      }

      setParsedSheets(sheets);
      setActiveSheet(sheets[0]?.key ?? "");
      setSelectedSheetKeys(sheets.map((sheet) => sheet.key));
    } catch {
      setParsedSheets([]);
      setActiveSheet("");
      setSelectedSheetKeys([]);
      setParseError("文件解析失败，请确认文件格式是否正确。");
    } finally {
      setParsing(false);
    }
  }

  function resetUpload() {
    setFileName("");
    setUploadedFile(null);
    setParsedSheets([]);
    setActiveSheet("");
    setSelectedSheetKeys([]);
    setActivePreviewTab("preview");
    setParsing(false);
    setParseError("");
  }

  function toggleSheetSelection(sheetKey: string) {
    setSelectedSheetKeys((currentKeys) =>
      currentKeys.includes(sheetKey)
        ? currentKeys.filter((currentKey) => currentKey !== sheetKey)
        : [...currentKeys, sheetKey],
    );
  }

  if (fileName) {
    return (
      <div className="px-8 py-7">
        {messageNotice ? <MessageNotice notice={messageNotice} /> : null}
        <div className="min-h-[520px] rounded-2xl bg-[#f5f8fc] p-5">
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between bg-[#f3f6fb] px-5">
              <div className="flex min-w-0 flex-1 items-center overflow-hidden text-sm font-medium">
                {parsing ? <span className="text-muted-foreground">正在解析文件...</span> : null}
                {!parsing && parsedSheets.length === 0 ? (
                  <span className="text-muted-foreground">暂无可预览的 Sheet</span>
                ) : null}
                {parsedSheets.length > 0 ? (
                  <Tabs
                    className="min-w-0 flex-1 gap-0"
                    value={activeSheet}
                    onValueChange={setActiveSheet}
                  >
                    <TabsList className="h-auto w-full justify-start overflow-hidden rounded-none bg-transparent p-0">
                      {parsedSheets.map((sheet, index) => (
                        <div
                          className={
                            activeSheet === sheet.key
                              ? "flex flex-none items-center rounded-t-lg bg-white text-foreground"
                              : "flex flex-none items-center text-muted-foreground transition-colors hover:text-foreground"
                          }
                          key={sheet.key}
                        >
                          <input
                            aria-label={`选择 ${sheet.name}`}
                            checked={selectedSheetKeys.includes(sheet.key)}
                            className="ml-5 size-4 shrink-0 accent-primary"
                            onChange={() => toggleSheetSelection(sheet.key)}
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                          />
                          <TabsTrigger
                            className="h-auto justify-start rounded-none border-0 bg-transparent py-3 pr-5 pl-2 text-inherit shadow-none data-active:bg-transparent data-active:text-inherit data-active:shadow-none"
                            value={sheet.key}
                          >
                            <span className="truncate">{sheet.name}</span>
                          </TabsTrigger>
                          {index < parsedSheets.length - 1 &&
                          activeSheet !== sheet.key &&
                          activeSheet !== parsedSheets[index + 1]?.key ? (
                            <span className="mr-0 h-5 w-px bg-black/10" />
                          ) : null}
                        </div>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : null}
              </div>
              <Button
                className="ml-4 shrink-0"
                onClick={resetUpload}
                size="sm"
                type="button"
                variant="ghost"
              >
                <RotateCcw className="size-3.5" />
                重新上传
              </Button>
            </div>

            {parseError ? (
              <div className="mx-5 mt-5 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {parseError}
              </div>
            ) : null}

            <div className="flex items-center justify-between px-5 pt-5">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                展示名称
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        aria-label="展示名称说明"
                        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        type="button"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      请填入规范的名称，不要使用特殊字符，前后不能包含空格。
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Input className="h-8 w-72 rounded-md bg-white" value={activeSheetName} readOnly />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                设置第
                <Input className="h-8 w-12 rounded-md bg-white text-center" defaultValue="1" />
                行是标题行
              </label>
            </div>

            <div className="px-5 pt-5">
              <div className="mb-3 inline-flex rounded-lg bg-[#f4f6f9] p-1 text-sm">
                <button
                  className={
                    activePreviewTab === "preview"
                      ? "h-8 rounded-md bg-white px-4 font-medium shadow-sm"
                      : "h-8 rounded-md px-4 text-muted-foreground"
                  }
                  onClick={() => setActivePreviewTab("preview")}
                  type="button"
                >
                  数据预览
                </button>
                <button
                  className={
                    activePreviewTab === "detail"
                      ? "h-8 rounded-md bg-white px-4 font-medium shadow-sm"
                      : "h-8 rounded-md px-4 text-muted-foreground"
                  }
                  onClick={() => setActivePreviewTab("detail")}
                  type="button"
                >
                  字段详情
                </button>
              </div>

              {parsing ? (
                <div className="rounded-md border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
                  正在解析并识别字段类型...
                </div>
              ) : activePreviewTab === "detail" ? (
                <div className="w-[760px] overflow-visible text-sm">
                  <Table containerClassName="overflow-visible">
                    <TableHeader>
                      <TableRow className="bg-[#f3f5fa] hover:bg-[#f3f5fa]">
                        <TableHead>源字段</TableHead>
                        <TableHead>字段别名</TableHead>
                        <TableHead className="w-44">字段类型</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field) => (
                        <TableRow className="hover:bg-transparent" key={field.key}>
                          <TableCell>
                            <span className="text-muted-foreground">{field.label}</span>
                          </TableCell>
                          <TableCell>
                            <Input className="h-8 rounded-md bg-white" defaultValue={field.label} />
                          </TableCell>
                          <TableCell>
                            <FieldTypeDropdown
                              fieldKey={field.key}
                              type={field.type}
                              variant="select"
                              onChange={changeFieldType}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="max-w-[920px] rounded-md border border-black/5 text-sm">
                  <Table containerClassName="overflow-visible">
                    <TableHeader>
                      <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc]">
                        {fields.map((field) => (
                          <TableHead className="relative min-w-44 px-3 py-2" key={field.key}>
                            <div className="flex items-center gap-2">
                              <FieldTypeDropdown
                                fieldKey={field.key}
                                type={field.type}
                                onChange={changeFieldType}
                              />
                              <Input
                                className="h-7 min-w-32 rounded-md bg-white"
                                defaultValue={field.label}
                              />
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, rowIndex) => (
                        <TableRow className="even:bg-[#f6f8fb]" key={`${activeSheet}-${rowIndex}`}>
                          {fields.map((field, columnIndex) => (
                            <TableCell className="px-4 py-2 whitespace-nowrap" key={field.key}>
                              {row[columnIndex] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="mt-72 px-5 pb-5 text-xs text-muted-foreground">
              <Info className="mr-1 inline size-3.5" />
              最多预览前100行数据
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-8 py-8">
      {messageNotice ? <MessageNotice notice={messageNotice} /> : null}
      <FileUpload
        accept=".csv,.xlsx,.xls"
        className="max-w-2xl"
        fileName={fileName}
        onFileChange={handleFileChange}
      />
      {parseError ? <p className="mt-3 text-sm text-destructive">{parseError}</p> : null}
      {parsing ? <p className="mt-3 text-sm text-muted-foreground">正在解析文件...</p> : null}

      <div className="mt-12 w-full max-w-2xl">
        <div className="mb-5 flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-sm font-medium text-muted-foreground">温馨提示</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ul className="grid gap-2 text-sm text-muted-foreground">
          {tips.map((tip) => (
            <li className="flex gap-2" key={tip}>
              <span className="mt-2 size-1.5 rounded-full bg-primary" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 max-w-lg overflow-hidden rounded-2xl border bg-white text-sm">
          <div className="grid grid-cols-3 bg-muted/50 px-7 py-3 text-muted-foreground">
            <span>Date</span>
            <span>Header</span>
            <span>Amount</span>
          </div>
          {[
            ["2024/02/01", "lydaas.com", "40,000"],
            ["2024/02/02", "bi.aliyun.com", "678,321"],
            ["-", "-", "-"],
          ].map((row) => (
            <div
              className="grid grid-cols-3 border-t px-7 py-3 text-muted-foreground"
              key={row.join()}
            >
              <span>{row[0]}</span>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 text-center text-sm text-muted-foreground">上传示例</div>
      </div>
    </div>
  );
}

function FileUploadSteps({ previewActive = false }: { previewActive?: boolean }) {
  const steps = ["文件上传", "预览数据"];

  return (
    <div className="flex min-w-[360px] items-center justify-center text-sm">
      {steps.map((step, index) => (
        <div className="flex items-center" key={step}>
          <span
            className={
              index === 0 || previewActive
                ? "mr-2 size-2 rounded-full bg-primary"
                : "mr-2 size-2 rounded-full bg-muted-foreground/25"
            }
          />
          <span className={index === 0 || previewActive ? "font-medium" : "text-muted-foreground"}>
            {step}
          </span>
          {index < steps.length - 1 ? (
            <span className="mx-8 h-px w-40 border-t border-dashed border-muted-foreground/25" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FieldTypeDropdown({
  fieldKey,
  onChange,
  type,
  variant = "icon",
}: {
  fieldKey: string;
  onChange: (fieldKey: string, fieldType: FieldType) => void;
  type: FieldType;
  variant?: "icon" | "select";
}) {
  const selectedLabel = fieldTypeOptions.find((option) => option.type === type)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "select" ? (
          <button
            className="flex h-8 w-full items-center justify-between rounded-md border bg-white px-3 text-left"
            type="button"
          >
            <span className="flex items-center gap-2">
              <FieldTypeIcon type={type} />
              {selectedLabel}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        ) : (
          <button
            aria-label="切换字段类型"
            className="flex size-6 shrink-0 items-center justify-center rounded bg-white text-primary transition-colors hover:bg-primary/10"
            type="button"
          >
            <FieldTypeIcon type={type} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-24 min-w-24" align="start" sideOffset={6}>
        {fieldTypeOptions.map((option) => (
          <DropdownMenuItem
            className="gap-2 px-3 py-2"
            key={option.type}
            onClick={() => onChange(fieldKey, option.type)}
          >
            <FieldTypeIcon type={option.type} />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FieldTypeIcon({ type }: { type: FieldType }) {
  if (type === "date") {
    return <CalendarDays className="size-4 text-primary" />;
  }

  if (type === "number") {
    return <Hash className="size-4 text-emerald-500" />;
  }

  return <Type className="size-4 text-primary" />;
}

function ApiConnectSteps() {
  const steps = ["建立API连接", "解析请求结果"];

  return (
    <div className="flex min-w-[360px] items-center justify-center text-sm">
      {steps.map((step, index) => (
        <div className="flex items-center" key={step}>
          <span
            className={
              index === 0
                ? "mr-2 size-2 rounded-full bg-primary"
                : "mr-2 size-2 rounded-full bg-muted-foreground/25"
            }
          />
          <span className={index === 0 ? "font-medium" : "text-muted-foreground"}>{step}</span>
          {index < steps.length - 1 ? (
            <span className="mx-8 h-px w-40 border-t border-dashed border-muted-foreground/25" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="grid gap-4 border-b border-black/5 pb-8 last:border-b-0">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RequiredInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  value?: string;
}) {
  return (
    <label className="grid grid-cols-[90px_1fr] items-center gap-4">
      <span className="text-sm">
        <span className="text-destructive">*</span> {label}
      </span>
      <Input
        className="h-9 rounded-md bg-white"
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        value={value}
      />
    </label>
  );
}
