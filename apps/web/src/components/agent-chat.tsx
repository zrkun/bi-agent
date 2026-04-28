"use client";

import { useState } from "react";
import { FileUp, Paperclip, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";

import {
  PromptInput,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Capability = {
  key: string;
  name: string;
  description: string;
};

type Datasource = {
  id: string;
  name: string;
  type: string;
  status: string;
  fields: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AgentChatProps = {
  capabilities: Capability[];
  datasources: Datasource[];
  prompts: string[];
};

const quickCommands = [
  { command: "/问数", description: "查询指标、维度和明细" },
  { command: "/解读", description: "解释趋势、波动和异常" },
  { command: "/报告", description: "生成经营分析报告" },
  { command: "/搭建", description: "生成大屏 JSON Spec" },
  { command: "/搜索", description: "搜索数据资产和字段" },
];

export function AgentChat({ datasources, prompts }: AgentChatProps) {
  const [input, setInput] = useState("");
  const [isCommandPanelOpen, setIsCommandPanelOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const showCommands = isCommandPanelOpen && input.trim().startsWith("/");

  async function submitMessage(message: string) {
    const content = message.trim();

    if (!content || isStreaming) {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setInput("");
    setIsCommandPanelOpen(false);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          capability: "qa",
          datasource_id: datasources[0]?.id ?? "",
          message: content,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        return;
      }

      let buffer = "";

      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- streaming readers must be consumed sequentially.
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.split("\n").find((item) => item.startsWith("data: "));

          if (!line) {
            continue;
          }

          const payload = line.slice(6);

          if (payload === "[DONE]") {
            continue;
          }

          const parsed = JSON.parse(payload) as { delta?: string };

          if (!parsed.delta) {
            continue;
          }

          setMessages((current) =>
            current.map((item) =>
              item.id === assistantMessage.id
                ? { ...item, content: `${item.content}${parsed.delta}` }
                : item,
            ),
          );
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <section
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col px-6",
        messages.length > 0 ? "min-h-[calc(100vh-3.5rem)] py-8" : "pt-44",
      )}
    >
      {messages.length > 0 ? <MessageList isStreaming={isStreaming} messages={messages} /> : null}

      <div
        className={cn(messages.length > 0 && "sticky bottom-0 mt-auto bg-transparent pt-6 pb-6")}
      >
        <PromptInput
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage(input);
          }}
        >
          <PromptInputTextarea
            onChange={(event) => {
              setInput(event.target.value);
              setIsCommandPanelOpen(event.target.value.trim().startsWith("/"));
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setIsCommandPanelOpen(false);
              }
            }}
            placeholder="问小Q任何数据问题，输入「/」使用快捷指令"
            value={input}
          />
          {showCommands ? (
            <CommandPanel
              commands={quickCommands}
              onSelect={(command) => {
                setInput(`${command} `);
                setIsCommandPanelOpen(false);
              }}
            />
          ) : null}
          <PromptInputToolbar>
            <PromptInputTools>
              <AttachmentMenu />
            </PromptInputTools>
            <div className="flex items-center gap-3">
              <PromptInputSubmit aria-label="发送" disabled={!input.trim() || isStreaming}>
                <Send />
              </PromptInputSubmit>
            </div>
          </PromptInputToolbar>
        </PromptInput>

        {messages.length === 0 ? (
          <PromptCards prompts={prompts} onSelect={(prompt) => void submitMessage(prompt)} />
        ) : null}
      </div>
    </section>
  );
}

function MessageList({ isStreaming, messages }: { isStreaming: boolean; messages: Message[] }) {
  return (
    <div className="mb-10 grid gap-5">
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-2xl rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
              {message.content}
            </div>
          </div>
        ) : (
          <Card key={message.id} className="bg-background/90 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">小Q问数</Badge>
              <span className="text-sm text-muted-foreground">为您回答</span>
            </div>
            <div className="rounded-lg border px-3 py-2 text-sm">
              {isStreaming && message.content.length === 0 ? "分析中..." : "分析完毕（用时13秒）"}
              <span className="float-right text-muted-foreground">点击展开分析过程 &gt;</span>
            </div>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{message.content}</div>
            {message.content.includes("| 2026-03 |") ? <ResultTable /> : null}
            <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
              <span>数据解读</span>
              <ThumbsUp className="size-4" />
              <ThumbsDown className="size-4" />
            </div>
          </Card>
        ),
      )}
    </div>
  );
}

function ResultTable() {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">订单日期(month)</th>
            <th className="px-3 py-2 text-right font-medium">本期销售金额</th>
            <th className="px-3 py-2 text-right font-medium">上月销售金额</th>
            <th className="px-3 py-2 text-right font-medium">销售金额(月环比差值)</th>
            <th className="px-3 py-2 text-right font-medium">销售金额(月环比)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-3">2026-03</td>
            <td className="px-3 py-3 text-right">3968</td>
            <td className="px-3 py-3 text-right">5405</td>
            <td className="px-3 py-3 text-right">-1437</td>
            <td className="px-3 py-3 text-right">-26.59%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CommandPanel({
  commands,
  onSelect,
}: {
  commands: typeof quickCommands;
  onSelect: (command: string) => void;
}) {
  return (
    <div className="absolute top-12 left-4 z-10 max-h-56 w-72 overflow-y-auto rounded-xl border bg-popover p-2 shadow-lg">
      <div className="px-3 py-2 text-sm font-medium">快捷指令</div>
      {commands.map((item) => (
        <button
          className="grid w-full gap-1 rounded-lg px-3 py-2 text-left hover:bg-muted"
          key={item.command}
          onClick={() => onSelect(item.command)}
          type="button"
        >
          <span className="text-sm font-medium">{item.command}</span>
          <span className="text-xs text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
}

function AttachmentMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton aria-label="添加附件">
          <Paperclip />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>添加附件</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <FileUp />
          上传文件
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PromptCards({
  onSelect,
  prompts,
}: {
  onSelect: (prompt: string) => void;
  prompts: string[];
}) {
  return (
    <div className="mt-8">
      <div className="flex flex-wrap justify-center gap-3">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            className="inline-flex max-w-72 items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-3 text-sm text-muted-foreground shadow-[0_4px_14px_rgba(15,23,42,0.08)] transition-colors hover:bg-muted/40 hover:text-foreground"
            onClick={() => onSelect(prompt)}
            type="button"
          >
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="truncate">{prompt.split("，")[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
