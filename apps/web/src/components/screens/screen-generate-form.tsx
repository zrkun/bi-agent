"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, WandSparkles } from "lucide-react";

import { ScreenPreview } from "@/components/screens/screen-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateScreenPreview, getScreen } from "@/lib/screens/api";
import type { DatasetRecord, GeneratePreviewResponse } from "@/lib/screens/types";

export function ScreenGenerateForm({ datasets }: { datasets: DatasetRecord[] }) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [prompt, setPrompt] = useState("基于当前数据集生成经营总览大屏");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratePreviewResponse["screen"] | null>(null);
  const [message, setMessage] = useState("");
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId),
    [datasetId, datasets],
  );

  useEffect(() => {
    let mounted = true;
    const id = new URLSearchParams(window.location.search).get("id");

    if (!id) {
      return undefined;
    }

    const screenId = id;

    async function loadScreen() {
      try {
        const data = await getScreen(screenId);

        if (!mounted) {
          return;
        }

        const screen = data.screen;

        if (!screen?.spec || !screen?.preview_data) {
          setMessage("未找到大屏数据，请重新从智能体预览进入编辑。");
          return;
        }

        setDatasetId(screen.dataset_id || datasets[0]?.id || "");
        setPrompt(screen.prompt || screen.name || "基于当前数据集生成经营总览大屏");
        setResult({
          dataset_id: screen.dataset_id,
          meta: screen.meta ?? {
            template: screen.spec.meta?.template ?? "custom",
            warnings: [],
          },
          name: screen.name,
          preview_data: screen.preview_data,
          spec: screen.spec,
        });
        setMessage("");
      } catch {
        if (mounted) {
          setMessage("大屏读取失败，请重新生成。");
        }
      }
    }

    void loadScreen();

    return () => {
      mounted = false;
    };
  }, [datasets]);

  async function handleGenerate() {
    if (!datasetId || !prompt.trim()) {
      setMessage("请选择数据集并输入生成需求。");
      return;
    }

    setGenerating(true);
    setMessage("");

    try {
      const data = await generateScreenPreview({
        datasetId,
        prompt,
        theme: "light",
      });

      if (!data.ok || !data.screen) {
        setMessage("生成失败，请稍后重试。");
        return;
      }

      setResult(data.screen);
    } catch {
      setMessage("生成失败：无法请求后端服务。");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] gap-5 max-xl:grid-cols-1">
      <Card className="h-fit border-white/70 bg-white/72 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <CardHeader>
          <Badge className="w-fit" variant="outline">
            AI BUILD
          </Badge>
          <CardTitle className="mt-2 text-xl">生成大屏初稿</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="dataset">
              数据集
            </label>
            <Select onValueChange={setDatasetId} value={datasetId}>
              <SelectTrigger id="dataset">
                <SelectValue placeholder="选择数据集" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDataset ? (
              <p className="text-xs text-muted-foreground">当前状态：{selectedDataset.status}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="prompt">
              生成需求
            </label>
            <Textarea
              className="min-h-32 resize-none"
              id="prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：生成销售经营总览大屏，包含核心指标、趋势、区域排行和明细表"
              value={prompt}
            />
          </div>

          {message ? <p className="text-sm text-red-500">{message}</p> : null}

          <Button
            disabled={generating || datasets.length === 0}
            onClick={handleGenerate}
            type="button"
          >
            {generating ? <Loader2 className="animate-spin" /> : <WandSparkles />}
            生成并预览
          </Button>

          {result?.meta?.warnings.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              {result.meta.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="min-h-[620px] overflow-hidden rounded-[28px] border border-white/70 bg-white/58 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">json-render 预览</div>
            <h2 className="mt-1 text-xl font-semibold">{result?.name || "等待生成"}</h2>
          </div>
          {result?.meta ? <Badge variant="secondary">{result.meta.template}</Badge> : null}
        </div>

        {result ? (
          <ScreenPreview previewData={result.preview_data ?? {}} spec={result.spec} />
        ) : (
          <div className="flex h-[540px] items-center justify-center rounded-[22px] border border-dashed bg-white/50 text-sm text-muted-foreground">
            选择数据集并生成后，这里会直接渲染 json-render 大屏。
          </div>
        )}
      </section>
    </div>
  );
}
