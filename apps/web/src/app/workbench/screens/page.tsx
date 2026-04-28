import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getJson } from "@/lib/server-api";

type Screen = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
};

export default async function ScreensPage() {
  const data = await getJson<{ items: Screen[] }>("/screens", { items: [] });

  return (
    <section className="grid gap-6 p-10">
      <div>
        <Badge variant="outline">大屏页面</Badge>
        <h1 className="mt-3 text-3xl font-semibold">大屏创建与编辑</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          支持 AI 生成和手动创建，基于 json-render Spec 保存、预览并进入拖拽编辑。
        </p>
      </div>

      <div className="grid grid-cols-[0.75fr_1.25fr] gap-4 max-lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>组件 Catalog</CardTitle>
            <CardDescription>首期大屏可用组件。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {["指标卡", "折线图", "柱状图", "饼图", "表格", "文本"].map((component) => (
              <Badge key={component} variant="secondary">
                {component}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>编辑器能力</CardTitle>
            <CardDescription>拖拽添加、移动缩放、属性修改、数据绑定、预览保存。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
              {["拖拽", "缩放", "删除", "复制", "属性", "绑定", "预览", "保存"].map((item) => (
                <div key={item} className="rounded-lg border bg-muted/30 p-3 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>大屏草稿</CardTitle>
          <CardDescription>保存的 json-render Spec 可继续编辑。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {data.items.map((screen) => (
            <div key={screen.id}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{screen.name}</div>
                  <div className="text-sm text-muted-foreground">更新于 {screen.updated_at}</div>
                </div>
                <Badge variant="outline">{screen.status}</Badge>
              </div>
              <Separator className="mt-4" />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
