import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Database } from "lucide-react";

type CompleteDatasourcePageProps = {
  searchParams: Promise<{
    type?: string;
  }>;
};

export default async function CompleteDatasourcePage({
  searchParams,
}: CompleteDatasourcePageProps) {
  const params = await searchParams;
  const datasourceType = params.type ?? "数据源";

  return (
    <>
      <div className="flex h-16 items-center justify-between">
        <Link
          className="inline-flex items-center gap-2 text-base font-semibold transition-colors hover:text-primary"
          href="/workbench/datasources/create/connect"
        >
          <ArrowLeft className="size-5" />
          新建数据源
        </Link>
        <div />
      </div>

      <div className="mx-auto flex max-w-3xl items-center justify-center gap-6 text-sm">
        {["选择数据源", "配置连接", "完成"].map((item, index) => (
          <div className="flex items-center gap-3" key={item}>
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {index < 2 ? <Check className="size-4" /> : index + 1}
            </span>
            <span className={index === 2 ? "font-medium" : "text-muted-foreground"}>{item}</span>
            {index < 2 ? <span className="h-px w-24 bg-border" /> : null}
          </div>
        ))}
      </div>

      <section className="mx-auto mt-16 flex max-w-2xl flex-col items-center rounded-3xl bg-white px-10 py-14 text-center shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <Database className="size-10" />
        </div>
        <h2 className="mt-8 text-xl font-semibold">数据源创建完成</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {datasourceType} 已完成创建流程，后续可以进入数据集或智能小Q中使用。
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild variant="outline">
            <Link href="/workbench/datasources/create">继续创建</Link>
          </Button>
          <Button asChild>
            <Link className="text-primary-foreground" href="/workbench/datasources">
              返回数据源
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
