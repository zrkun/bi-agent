import * as React from "react";
import { Upload } from "lucide-react";

import { cn } from "@/lib/utils";

type FileUploadProps = {
  accept?: string;
  className?: string;
  description?: string;
  fileName?: string;
  onFileChange?: (file: File | null) => void;
  title?: React.ReactNode;
};

function FileUpload({
  accept,
  className,
  description = "文件只支持 .csv、.xlsx、.xls 格式。",
  fileName,
  onFileChange,
  title = (
    <>
      <span className="font-medium text-primary">点击</span> 或将文件拖拽至此区域上传
    </>
  ),
}: FileUploadProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function emitFile(file: File | null) {
    onFileChange?.(file);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <label
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-muted-foreground/30 bg-[#f7f9fc] px-8 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5",
        dragActive && "border-primary/70 bg-primary/10",
        className,
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragActive(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        emitFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <Upload className="size-9 text-muted-foreground" />
      <span className="mt-4 text-sm">{title}</span>
      <span className="mt-2 text-xs text-muted-foreground">{description}</span>
      {fileName ? <span className="mt-2 text-xs text-foreground">{fileName}</span> : null}
      <input
        accept={accept}
        className="hidden"
        onChange={(event) => emitFile(event.target.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />
    </label>
  );
}

export { FileUpload };
