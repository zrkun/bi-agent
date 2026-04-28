import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function PromptInput({ className, ...props }: ComponentProps<"form">) {
  return (
    <form
      className={cn(
        "rounded-[2rem] border border-black/5 bg-white px-6 pt-5 pb-4 shadow-[0_8px_28px_rgba(15,23,42,0.10)]",
        className,
      )}
      {...props}
    />
  );
}

function PromptInputTextarea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn(
        "min-h-14 resize-none border-0 bg-transparent p-0 text-base shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  );
}

function PromptInputToolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-5 flex items-center justify-between", className)} {...props} />;
}

function PromptInputTools({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-2", className)} {...props} />;
}

function PromptInputButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      className="rounded-full border-0 bg-transparent shadow-none"
      size="icon"
      variant="ghost"
      {...props}
    />
  );
}

function PromptInputSubmit(props: ComponentProps<typeof Button>) {
  return (
    <Button
      className="rounded-full bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
      size="icon"
      type="submit"
      variant="ghost"
      {...props}
    />
  );
}

export {
  PromptInput,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
};
