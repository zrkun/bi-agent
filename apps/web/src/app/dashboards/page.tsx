import { LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DashboardsPageProps = {
  searchParams: Promise<{
    datasetId?: string;
  }>;
};

export default async function DashboardsPage({ searchParams }: DashboardsPageProps) {
  const params = await searchParams;

  return (
    <section className="grid gap-6">
      <div className="rounded-[28px] border border-white/70 bg-white/58 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <Badge variant="outline">仪表板</Badge>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#111418]">新建仪表板</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {params.datasetId
                ? `已从数据集 ${params.datasetId} 进入，后续可继续补完整创建流程。`
                : "请选择数据集后进入，继续配置仪表板内容。"}
            </p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LayoutDashboard className="size-5" />
          </span>
        </div>
        <div className="mt-6 flex gap-3">
          <Button disabled type="button">
            即将开放
          </Button>
        </div>
      </div>
    </section>
  );
}
