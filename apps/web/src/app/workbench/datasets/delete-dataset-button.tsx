"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
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

type DeleteDatasetButtonProps = {
  datasetId: string;
  datasetName: string;
};

export function DeleteDatasetButton({ datasetId, datasetName }: DeleteDatasetButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function deleteDataset() {
    setDeleting(true);

    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !data.ok) {
        window.alert(data.message || "数据集删除失败。");
        return;
      }

      router.refresh();
    } catch {
      window.alert("数据集删除失败：无法请求后端服务。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除 ${datasetName}`}
          disabled={deleting}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除数据集</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除数据集「{datasetName}」吗？删除后，基于该数据集配置的分析入口可能无法继续使用。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={deleteDataset}>
            {deleting ? "删除中..." : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
