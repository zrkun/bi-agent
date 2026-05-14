import Link from "next/link";
import { ArrowLeft, Database } from "lucide-react";
import {
  datasourceTypeIcons,
  emptyDatasourceTypesResponse,
  type DatasourceTypeItem,
  type DatasourceTypesResponse,
} from "@/lib/datasource-types";
import { getJson } from "@/lib/server-api";

export default async function CreateDatasourcePage() {
  const datasourceTypes = await getJson<DatasourceTypesResponse>(
    "/datasource-types",
    emptyDatasourceTypesResponse,
  );
  const hasDatasourceTypes = datasourceTypes.categories.some(
    (category) => category.items.length > 0,
  );

  return (
    <>
      <div className="flex h-16 items-center justify-between">
        <Link
          className="inline-flex items-center gap-2 text-base font-semibold transition-colors hover:text-primary"
          href="/datasources"
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
                index === 0
                  ? "flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                  : "flex size-7 items-center justify-center rounded-full bg-white text-xs text-muted-foreground"
              }
            >
              {index + 1}
            </span>
            <span className={index === 0 ? "font-medium" : "text-muted-foreground"}>{item}</span>
            {index < 2 ? <span className="h-px w-24 bg-border" /> : null}
          </div>
        ))}
      </div>

      <section className="mx-auto mt-12 max-w-7xl pb-2">
        {hasDatasourceTypes ? (
          <div className="grid grid-cols-[180px_1fr] gap-8">
            <aside className="grid content-start gap-1 text-sm">
              {datasourceTypes.categories.map((category, index) => (
                <a
                  className={
                    index === 0
                      ? "rounded-xl bg-primary/10 px-5 py-3 text-left font-medium text-primary"
                      : "rounded-xl px-5 py-3 text-left font-medium text-foreground hover:bg-white"
                  }
                  href={`#${category.key}`}
                  key={category.key}
                >
                  {category.title}
                </a>
              ))}
            </aside>

            <div className="grid gap-8">
              {datasourceTypes.categories.map((category) => (
                <section className="scroll-mt-6" id={category.key} key={category.key}>
                  <h3 className="mb-4 text-base font-semibold">{category.title}</h3>
                  {category.key === "database" ? (
                    <div className="mb-4 flex flex-wrap gap-3">
                      <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                        自建数据库
                      </span>
                    </div>
                  ) : null}
                  <DatasourceTypeGrid items={category.items} />
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-white px-8 py-14 text-center shadow-sm">
            <h3 className="text-base font-semibold">暂无可创建的数据源类型</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              当前接口未返回数据源类型，请先在本地数据库中配置后再创建。
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function DatasourceTypeGrid({ items }: { items: DatasourceTypeItem[] }) {
  return (
    <div className="grid grid-cols-4 gap-3 max-xl:grid-cols-3 max-lg:grid-cols-2">
      {items.map((item, index) => {
        const Icon = datasourceTypeIcons[item.icon as keyof typeof datasourceTypeIcons] ?? Database;

        return (
          <Link
            className="flex h-20 items-center gap-4 rounded-2xl bg-white px-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
            href={`/datasources/create/connect?type=${encodeURIComponent(item.type)}&name=${encodeURIComponent(item.name)}`}
            key={`${item.type}-${index}`}
          >
            <Icon className="size-5 text-primary" />
            <span className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium">{item.name}</span>
              <span className="truncate text-xs text-muted-foreground">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
