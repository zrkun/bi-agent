import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  ChevronDown,
  Eye,
  Filter,
  FolderPlus,
  MoreVertical,
  Pencil,
  Search,
  SquareChartGantt,
} from "lucide-react";

const datasets = [
  {
    id: "dataset-1",
    dataSource: "探索空间（公测）",
    modifiedAt: "2026/04/27 19:36:54",
    modifiedBy: "15072311267",
    name: "未命名",
    owner: "15072311267",
    status: "NEW",
  },
];

export default function DatasetsPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-7 flex items-center justify-between">
        <div>
          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Link className="transition-colors hover:text-foreground" href="/workbench">
              工作台
            </Link>
            <span>/</span>
            <span>数据集</span>
          </div>
          <h1 className="text-xl font-semibold text-[#111418]">数据集</h1>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input className="size-4 accent-primary" type="checkbox" />
            仅展示我的
          </label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 w-48 rounded-full bg-white pl-9" />
          </div>
          <Button
            className="gap-2 bg-white text-foreground shadow-sm hover:bg-[#f5f7fb]"
            variant="outline"
          >
            <Filter className="size-4" />
            筛选
          </Button>
          <Button
            className="gap-2 bg-white text-foreground shadow-sm hover:bg-[#f5f7fb]"
            variant="outline"
          >
            默认排序
            <ChevronDown className="size-4" />
          </Button>
          <Button
            className="gap-2 bg-white text-foreground shadow-sm hover:bg-[#f5f7fb]"
            variant="outline"
          >
            <FolderPlus className="size-4" />
            新建文件夹
          </Button>
          <Button asChild>
            <Link className="text-#fff!" href="/workbench/datasets/create">
              新建数据集
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 pl-6">
                <input className="size-4 accent-primary" type="checkbox" />
              </TableHead>
              <TableHead className="min-w-64">名称</TableHead>
              <TableHead>所有者</TableHead>
              <TableHead>修改人</TableHead>
              <TableHead>修改时间</TableHead>
              <TableHead>数据源</TableHead>
              <TableHead className="w-36 pr-6">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datasets.map((dataset) => (
              <TableRow className="text-[#8b8f95]" key={dataset.id}>
                <TableCell className="pl-6">
                  <input className="size-4 accent-primary" type="checkbox" />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-primary">
                      <BarChart3 className="size-3.5" />
                    </span>
                    <span className="font-medium">{dataset.name}</span>
                    <span className="text-[10px] font-semibold text-red-500">{dataset.status}</span>
                    <Eye className="size-3.5 text-muted-foreground" />
                  </div>
                </TableCell>
                <TableCell>{dataset.owner}</TableCell>
                <TableCell>{dataset.modifiedBy}</TableCell>
                <TableCell>{dataset.modifiedAt}</TableCell>
                <TableCell>{dataset.dataSource}</TableCell>
                <TableCell className="pr-6">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <button className="transition-colors hover:text-primary" type="button">
                      <Pencil className="size-4" />
                    </button>
                    <button className="transition-colors hover:text-primary" type="button">
                      <SquareChartGantt className="size-4" />
                    </button>
                    <button className="transition-colors hover:text-primary" type="button">
                      <BarChart3 className="size-4" />
                    </button>
                    <button className="transition-colors hover:text-primary" type="button">
                      <MoreVertical className="size-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="h-80" />
      </div>
    </div>
  );
}
