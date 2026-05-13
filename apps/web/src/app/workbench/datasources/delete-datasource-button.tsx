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

type DeleteDatasourceButtonProps = {
  datasourceId: string;
  datasourceName: string;
};

export function DeleteDatasourceButton({
  datasourceId,
  datasourceName,
}: DeleteDatasourceButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function deleteDatasource() {
    setDeleting(true);

    try {
      const response = await fetch(`/api/datasources/${encodeURIComponent(datasourceId)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !data.ok) {
        window.alert(data.message || "数据源删除失败。");
        return;
      }

      router.replace("/workbench/datasources");
      router.refresh();
    } catch {
      window.alert("数据源删除失败：无法请求后端服务。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={`删除 ${datasourceName}`}
          disabled={deleting}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除数据源</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除数据源「{datasourceName}
            」吗？这只会删除系统里的数据源配置，不会删除目标数据库中的表。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={deleteDatasource}>
            {deleting ? "删除中..." : "删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
