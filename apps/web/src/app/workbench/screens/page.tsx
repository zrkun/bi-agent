import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkbenchPageHeader } from "@/components/workbench-page-header";
import { FileBarChart } from "lucide-react";
import { getJson } from "@/lib/server-api";

type ScreensPageProps = {
  searchParams: Promise<{
    page?: string;
  }>;
};

type Screen = {
  dataset_id: string;
  id: string;
  name: string;
  prompt: string;
  status: string;
  updated_at?: string;
};

type ScreenListResponse = {
  items: Screen[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

const emptyResponse: ScreenListResponse = {
  items: [],
  pagination: {
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1,
  },
};

function buildPageHref(page: number) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  return `/workbench/screens?${params.toString()}`;
}

function getVisiblePages(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return [...pages]
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    .toSorted((left, right) => left - right);
}

export default async function ScreensPage({ searchParams }: ScreensPageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const screenData = await getJson<ScreenListResponse>(
    `/screens?page=${safePage}&page_size=10`,
    emptyResponse,
  );
  const draftCount = screenData.items.filter((item) => item.status === "draft").length;
  const publishedCount = screenData.items.filter((item) => item.status === "published").length;
  const currentPage = screenData.pagination.page;
  const totalPages = screenData.pagination.total_pages;
  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="flex flex-1 flex-col">
      <WorkbenchPageHeader
        action={
          <Button asChild>
            <Link className="text-#fff!" href="/workbench/screens/new">
              创建大屏
            </Link>
          </Button>
        }
        description="统一管理 AI 生成和手动创建的数据大屏，支持继续编辑与发布。"
        eyebrow="SCREEN"
        stats={[
          { label: "大屏", value: screenData.pagination.total },
          { label: "草稿", value: draftCount },
          { label: "已发布", value: publishedCount },
        ]}
        title="数据大屏"
      />

      <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/58 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <Table containerClassName="flex-1">
          <TableHeader>
            <TableRow className="bg-white/45 hover:bg-white/45">
              <TableHead className="min-w-72">名称</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>数据集 ID</TableHead>
              <TableHead>修改时间</TableHead>
              <TableHead className="w-40 pr-6 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {screenData.items.length > 0 ? (
              screenData.items.map((screen) => (
                <TableRow className="text-[#717781]" key={screen.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileBarChart className="size-3.5" />
                      </span>
                      <span className="font-medium">{screen.name}</span>
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {screen.prompt || "未填写描述"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{screen.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {screen.dataset_id}
                  </TableCell>
                  <TableCell>{screen.updated_at || "-"}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/workbench/screens/new?id=${encodeURIComponent(screen.id)}`}>
                          编辑
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-[420px] text-center" colSpan={5}>
                  <div className="flex h-full flex-col items-center justify-center">
                    <img alt="" className="mb-3 h-[120px] w-[160px]" src="/empty-dataset.svg" />
                    <span className="text-sm text-muted-foreground">暂无数据大屏。</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {screenData.pagination.total > 0 ? (
          <div className="flex items-center justify-between border-t border-white/70 px-6 py-4 text-sm text-muted-foreground">
            <span>
              第 {currentPage} / {totalPages} 页，共 {screenData.pagination.total} 条
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={currentPage <= 1}
                    className={currentPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                    href={buildPageHref(Math.max(1, currentPage - 1))}
                  />
                </PaginationItem>
                {visiblePages.map((pageNumber, index) => (
                  <PaginationItem key={pageNumber}>
                    {index > 0 && pageNumber - visiblePages[index - 1] > 1 ? (
                      <span className="px-1 text-muted-foreground">...</span>
                    ) : null}
                    <PaginationLink
                      href={buildPageHref(pageNumber)}
                      isActive={pageNumber === currentPage}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={currentPage >= totalPages}
                    className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
                    href={buildPageHref(Math.min(totalPages, currentPage + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </div>
    </div>
  );
}
