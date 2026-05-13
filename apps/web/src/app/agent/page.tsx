"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Code2,
  Database,
  ExternalLink,
  Eye,
  Globe2,
  Maximize2,
  Pencil,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { AppShell } from "@/components/app-shell";
import { ScreenPreview } from "@/components/screens/screen-preview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createScreen } from "@/lib/screens/api";
import type { JsonRenderSpec, PreviewData } from "@/lib/screens/types";
import { cn } from "@/lib/utils";

type AgentHomeData = {
  capabilities: Array<{
    description: string;
    key: string;
    name: string;
  }>;
  prompts: string[];
};

type Dataset = {
  field_count?: number;
  id: string;
  name: string;
  status: string;
};

type Message = {
  artifacts?: AgentArtifact[];
  capability?: "qa" | "builder" | "guide";
  content: string;
  id: string;
  intent?: string;
  parts?: MessagePart[];
  role: "user" | "assistant";
  status?: "running" | "completed" | "failed";
  statusText?: string;
  tools?: AgentTool[];
};

type MessagePart =
  | {
      id: string;
      text: string;
      type: "text";
    }
  | {
      id: string;
      step: AgentStep;
      type: "step";
    }
  | {
      id: string;
      tool: AgentTool;
      type: "tool";
    };

type AgentStep = {
  description?: string;
  id: string;
  name: string;
  state: "completed" | "failed" | "running";
  type?: string;
};

type AgentTool = {
  description?: string;
  id: string;
  input?: unknown;
  name: string;
  output?: unknown;
  state: "completed" | "failed" | "running";
  type?: string;
};

type AgentArtifact =
  | {
      data: {
        columns: string[];
        rows: Record<string, unknown>[];
      };
      id: string;
      kind: "table";
      title?: string;
    }
  | {
      data: {
        previewData: Record<string, unknown>;
        spec: Record<string, unknown>;
      };
      id: string;
      kind: "screen_preview";
      title?: string;
    };

type AgentEvent = {
  payload: Record<string, unknown>;
  type: string;
};

export default function AgentPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [input, setInput] = useState("");
  const [isRunLoading, setIsRunLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [previewArtifact, setPreviewArtifact] =
    useState<Extract<AgentArtifact, { kind: "screen_preview" }> | null>(null);
  const [previewWidth, setPreviewWidth] = useState(760);
  const [selectedDatasetMention, setSelectedDatasetMention] = useState<Dataset | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadPageData() {
      const [agentResponse, datasetResponse] = await Promise.all([
        fetch("/api/agent/capabilities", { cache: "no-store" }),
        fetch("/api/datasets", { cache: "no-store" }),
      ]);
      const agentData = (await agentResponse.json()) as AgentHomeData;
      const datasetData = (await datasetResponse.json()) as { items: Dataset[] };

      if (!mounted) {
        return;
      }

      const nextDatasets = datasetData.items ?? [];

      setDatasets(nextDatasets);
      setPrompts(agentData.prompts ?? []);
    }

    void loadPageData();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!previewArtifact) {
      return;
    }

    setPreviewWidth(Math.round(window.innerWidth * 0.8));
  }, [previewArtifact?.id]);

  async function submitMessage(message: string) {
    const content = message.trim();

    if (!content || isStreaming || isRunLoading) {
      return;
    }

    const datasetId = selectedDatasetId;
    const userMessage: Message = {
      content,
      id: crypto.randomUUID(),
      role: "user",
    };
    const assistantMessage: Message = {
      artifacts: [],
      capability: "builder",
      content: "",
      id: crypto.randomUUID(),
      parts: [],
      role: "assistant",
      status: "running",
      statusText: "正在理解问题",
      tools: [],
    };

    setInput("");
    setSelectedDatasetId("");
    setSelectedDatasetMention(null);
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/agent/runs", {
        body: JSON.stringify({
          capability: "builder",
          dataset_id: datasetId,
          message: content,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
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

          applyAgentEvent(
            JSON.parse(payload) as AgentEvent | { delta?: string },
            assistantMessage.id,
          );
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function applyAgentEvent(event: AgentEvent | { delta?: string }, messageId: string) {
    if ("delta" in event && event.delta) {
      appendAssistantText(messageId, event.delta);
      return;
    }

    if (!("type" in event)) {
      return;
    }

    if (event.type === "answer.delta") {
      appendAssistantText(messageId, String(event.payload.text ?? ""));
      return;
    }

    if (event.type === "run.started") {
      const capability = event.payload.capability;
      setIsRunLoading(true);
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                capability:
                  capability === "builder" || capability === "guide" || capability === "qa"
                    ? capability
                    : item.capability,
                statusText: "正在理解问题",
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "plan.created") {
      const intent = typeof event.payload.intent === "string" ? event.payload.intent : undefined;
      const summary = typeof event.payload.summary === "string" ? event.payload.summary : undefined;
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                capability:
                  intent === "build_screen"
                    ? "builder"
                    : intent === "guide"
                      ? "guide"
                      : item.capability,
                intent,
                statusText: summary ?? getMessageStatusText(item),
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "step.started") {
      const stepId =
        typeof event.payload.stepId === "string" ? event.payload.stepId : crypto.randomUUID();
      const label = typeof event.payload.label === "string" ? event.payload.label : "正在处理";
      const stepType = typeof event.payload.step === "string" ? event.payload.step : undefined;
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                parts:
                  stepId === "llm-planning"
                    ? upsertToolPart(item.parts, {
                        id: stepId,
                        name: label,
                        state: "running",
                        type: stepType,
                      })
                    : upsertStepPart(item.parts, {
                        id: stepId,
                        name: label,
                        state: "running",
                        type: stepType,
                      }),
                statusText: label,
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "step.completed") {
      const stepId =
        typeof event.payload.stepId === "string" ? event.payload.stepId : undefined;
      const label =
        typeof event.payload.outputSummary === "string" ? event.payload.outputSummary : undefined;
      const output =
        stepId === "llm-planning" &&
        event.payload.output &&
        typeof event.payload.output === "object" &&
        "intent" in event.payload.output
          ? (event.payload.output as { intent?: unknown }).intent
          : undefined;
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                parts:
                  stepId === "llm-planning"
                    ? updateToolPartState(item.parts, stepId, "completed", {
                        description: label,
                        output,
                      })
                    : updateStepPartState(item.parts, stepId, "completed", {
                        description: label,
                      }),
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "step.failed") {
      const stepId =
        typeof event.payload.stepId === "string" ? event.payload.stepId : undefined;
      const message = typeof event.payload.message === "string" ? event.payload.message : undefined;
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                parts: updateStepPartState(item.parts, stepId, "failed", {
                  description: message,
                }),
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "tool.started") {
      const toolCallId =
        typeof event.payload.toolCallId === "string"
          ? event.payload.toolCallId
          : crypto.randomUUID();
      const label = typeof event.payload.label === "string" ? event.payload.label : "正在处理";
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                statusText: label,
                tools: upsertTool(item.tools, {
                  description:
                    typeof event.payload.inputSummary === "string"
                      ? event.payload.inputSummary
                      : undefined,
                  id: toolCallId,
                  input: event.payload.input,
                  name: label,
                  state: "running",
                  type: typeof event.payload.tool === "string" ? event.payload.tool : undefined,
                }),
                parts: upsertToolPart(item.parts, {
                  description:
                    typeof event.payload.inputSummary === "string"
                      ? event.payload.inputSummary
                      : undefined,
                  id: toolCallId,
                  input: event.payload.input,
                  name: label,
                  state: "running",
                  type: typeof event.payload.tool === "string" ? event.payload.tool : undefined,
                }),
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "tool.completed") {
      const toolCallId =
        typeof event.payload.toolCallId === "string" ? event.payload.toolCallId : undefined;
      const label =
        typeof event.payload.outputSummary === "string" ? event.payload.outputSummary : undefined;
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                tools: updateToolState(item.tools, toolCallId, "completed", {
                  description: label,
                  output: event.payload.output,
                }),
                parts: updateToolPartState(item.parts, toolCallId, "completed", {
                  description: label,
                  output: event.payload.output,
                }),
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "tool.failed") {
      const toolCallId =
        typeof event.payload.toolCallId === "string" ? event.payload.toolCallId : undefined;
      const message = typeof event.payload.message === "string" ? event.payload.message : undefined;
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                tools: updateToolState(item.tools, toolCallId, "failed", {
                  description: message,
                  output: event.payload.output,
                }),
                parts: updateToolPartState(item.parts, toolCallId, "failed", {
                  description: message,
                  output: event.payload.output,
                }),
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "artifact.created") {
      const artifact = normalizeArtifact(event.payload);

      if (!artifact) {
        return;
      }

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? { ...item, artifacts: [...(item.artifacts ?? []), artifact] }
            : item,
        ),
      );
      return;
    }

    if (event.type === "run.failed") {
      setIsRunLoading(false);
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                content: String(event.payload.message ?? "智能小Q暂时无法完成本次请求。"),
                parts: [
                  ...(item.parts ?? []),
                  {
                    id: crypto.randomUUID(),
                    text: String(event.payload.message ?? "智能小Q暂时无法完成本次请求。"),
                    type: "text",
                  },
                ],
                status: "failed",
                statusText: "执行失败",
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "run.completed") {
      setIsRunLoading(false);
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId ? { ...item, status: "completed", statusText: "已完成" } : item,
        ),
      );
    }
  }

  function appendAssistantText(messageId: string, text: string) {
    if (!text) {
      return;
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              content: `${item.content}${text}`,
              parts: appendTextPart(item.parts, text),
            }
          : item,
      ),
    );
  }

  const isSessionLoading = isRunLoading || isStreaming;

  return (
    <AppShell contentClassName="bg-[linear-gradient(115deg,#fbf9fc_0%,#f4f8fb_48%,#f8fbfd_100%)]">
      <section
        className={cn(
          "mx-auto flex h-full min-h-0 w-full pt-6 pb-6",
          previewArtifact ? "gap-4 px-6" : "max-w-[1080px] flex-col",
          messages.length === 0 && !previewArtifact && "justify-center px-6",
        )}
      >
        <div
          className={cn(
            "mx-auto flex min-h-0 w-full flex-col",
            previewArtifact ? "max-w-[720px] flex-1" : "max-w-[1080px]",
            messages.length > 0 && "h-full",
            messages.length > 0 && "bg-transparent",
            messages.length === 0 && "px-0",
          )}
        >
          {messages.length > 0 ? (
            <MessageList messages={messages} onOpenPreview={setPreviewArtifact} />
          ) : null}

          <div
            className={cn(
              "mx-auto w-full shrink-0",
              messages.length > 0 && "mt-auto bg-transparent pt-3",
            )}
          >
            <PromptInput
              className="relative [&_[data-slot=input-group]]:min-h-28 [&_[data-slot=input-group]]:items-stretch [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-[#e7ecf2] [&_[data-slot=input-group]]:bg-white [&_[data-slot=input-group]]:shadow-[0_18px_45px_rgba(15,23,42,0.10),0_1px_0_rgba(255,255,255,0.95)_inset] [&_[data-slot=input-group]:has(:disabled)]:bg-white [&_[data-slot=input-group]:has(:disabled)]:opacity-100 [&_[data-slot=input-group-control]]:text-[15px] [&_[data-slot=input-group-control]]:placeholder:text-muted-foreground/65"
              onSubmit={() => {
                void submitMessage(input);
              }}
            >
              {selectedDatasetMention ? (
                <PromptInputHeader className="px-4 pt-3 pb-0">
                  <DatasetMentionTag
                    selectedDataset={selectedDatasetMention}
                    onRemove={() => {
                      setSelectedDatasetMention(null);
                      setSelectedDatasetId("");
                    }}
                  />
                </PromptInputHeader>
              ) : null}
              <PromptInputBody>
                <PromptInputTextarea
                  className="min-h-16 px-4 pt-3.5 text-[14px]"
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="问小Q任何数据问题"
                  value={input}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools className="flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <PromptInputButton
                        className="h-8 rounded-lg border border-border bg-background px-3 text-sm hover:bg-muted"
                        type="button"
                      >
                        <Database className="size-4" />
                        {selectedDatasetMention?.name ?? "选择数据集"}
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      </PromptInputButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-auto min-w-32 max-w-56">
                      {datasets.map((dataset) => (
                        <DropdownMenuItem
                          key={dataset.id}
                          onClick={() => {
                            setSelectedDatasetId(dataset.id);
                            setSelectedDatasetMention(dataset);
                          }}
                        >
                          {dataset.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </PromptInputTools>
                <PromptInputSubmit
                  aria-label="发送"
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted-foreground/35 disabled:text-background disabled:opacity-100"
                  disabled={!input.trim() || isSessionLoading}
                  status={isSessionLoading ? "submitted" : "ready"}
                >
                  {isSessionLoading ? null : <Send />}
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>

            {messages.length === 0 ? (
              <PromptCards prompts={prompts} onSelect={(prompt) => void submitMessage(prompt)} />
            ) : null}
          </div>
        </div>
        {previewArtifact ? (
          <ScreenPreviewPanel
            artifact={previewArtifact}
            onClose={() => setPreviewArtifact(null)}
            onResize={setPreviewWidth}
            width={previewWidth}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

function upsertTool(tools: AgentTool[] = [], tool: AgentTool) {
  const exists = tools.some((item) => item.id === tool.id);

  if (!exists) {
    return [...tools, tool];
  }

  return tools.map((item) => (item.id === tool.id ? { ...item, ...tool } : item));
}

function updateToolState(
  tools: AgentTool[] = [],
  toolId: string | undefined,
  state: AgentTool["state"],
  update?: Pick<AgentTool, "description" | "output">,
) {
  if (!toolId) {
    return tools;
  }

  return tools.map((tool) =>
    tool.id === toolId
      ? {
          ...tool,
          description: update?.description ?? tool.description,
          output: update?.output ?? tool.output,
          state,
        }
      : tool,
  );
}

function appendTextPart(parts: MessagePart[] = [], text: string): MessagePart[] {
  const lastPart = parts.at(-1);

  if (lastPart?.type === "text") {
    return [
      ...parts.slice(0, -1),
      {
        ...lastPart,
        text: `${lastPart.text}${text}`,
      },
    ];
  }

  return [
    ...parts,
    {
      id: crypto.randomUUID(),
      text,
      type: "text",
    },
  ];
}

function upsertToolPart(parts: MessagePart[] = [], tool: AgentTool): MessagePart[] {
  if (parts.some((part) => part.type === "tool" && part.tool.id === tool.id)) {
    return parts.map((part) =>
      part.type === "tool" && part.tool.id === tool.id
        ? { ...part, tool: { ...part.tool, ...tool } }
        : part,
    );
  }

  return [
    ...parts,
    {
      id: tool.id,
      tool,
      type: "tool",
    },
  ];
}

function upsertStepPart(parts: MessagePart[] = [], step: AgentStep): MessagePart[] {
  if (parts.some((part) => part.type === "step" && part.step.id === step.id)) {
    return parts.map((part) =>
      part.type === "step" && part.step.id === step.id
        ? { ...part, step: { ...part.step, ...step } }
        : part,
    );
  }

  return [
    ...parts,
    {
      id: step.id,
      step,
      type: "step",
    },
  ];
}

function updateStepPartState(
  parts: MessagePart[] = [],
  stepId: string | undefined,
  state: AgentStep["state"],
  update?: Pick<AgentStep, "description">,
) {
  if (!stepId) {
    return parts;
  }

  return parts.map((part) =>
    part.type === "step" && part.step.id === stepId
      ? {
          ...part,
          step: {
            ...part.step,
            description: update?.description ?? part.step.description,
            state,
          },
        }
      : part,
  );
}

function updateToolPartState(
  parts: MessagePart[] = [],
  toolId: string | undefined,
  state: AgentTool["state"],
  update?: Pick<AgentTool, "description" | "output">,
) {
  if (!toolId) {
    return parts;
  }

  return parts.map((part) =>
    part.type === "tool" && part.tool.id === toolId
      ? {
          ...part,
          tool: {
            ...part.tool,
            description: update?.description ?? part.tool.description,
            output: update?.output ?? part.tool.output,
            state,
          },
        }
      : part,
  );
}

function MessageList({
  messages,
  onOpenPreview,
}: {
  messages: Message[];
  onOpenPreview: (artifact: Extract<AgentArtifact, { kind: "screen_preview" }>) => void;
}) {
  return (
    <Conversation className="min-h-0 agent-conversation-scroll">
      <ConversationContent className="p-0!">
        {messages.map((message) => {
          const visibleParts = getVisibleMessageParts(message.parts);

          return (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.role === "user" ? (
                  message.content
                ) : (
                  <Card className="min-w-0 bg-background/90 p-4">
                    {visibleParts.length ? <MessagePartList parts={visibleParts} /> : null}
                    {message.status === "completed" && message.artifacts?.length ? (
                      <ArtifactLinkList artifacts={message.artifacts} onOpenPreview={onOpenPreview} />
                    ) : null}
                    {message.status === "running" && !visibleParts.length ? (
                      <AssistantLoading statusText={message.statusText} />
                    ) : null}
                    {message.status === "running" && visibleParts.length ? (
                      <MessageRunningBar statusText={message.statusText} />
                    ) : null}
                  </Card>
                )}
              </MessageContent>
            </Message>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function ArtifactLinkList({
  artifacts,
  onOpenPreview,
}: {
  artifacts: AgentArtifact[];
  onOpenPreview: (artifact: Extract<AgentArtifact, { kind: "screen_preview" }>) => void;
}) {
  const screenArtifacts = artifacts.filter(
    (artifact): artifact is Extract<AgentArtifact, { kind: "screen_preview" }> =>
      artifact.kind === "screen_preview",
  );

  if (!screenArtifacts.length) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-2">
      {screenArtifacts.map((artifact) => (
        <ScreenPreviewLinkCard
          artifact={artifact}
          key={artifact.id}
          onOpen={() => onOpenPreview(artifact)}
        />
      ))}
    </div>
  );
}

function ScreenPreviewLinkCard({
  artifact,
  onOpen,
}: {
  artifact: Extract<AgentArtifact, { kind: "screen_preview" }>;
  onOpen: () => void;
}) {
  const spec = artifact.data.spec as JsonRenderSpec;
  const bindingCount = Object.keys(spec.dataBindings ?? {}).length;
  const title = artifact.title?.replace(/[。.!！?？]+$/u, "") || "经营分析大屏";

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
          <Globe2 className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground/90">{title}</div>
          <div className="truncate text-xs text-muted-foreground">
            数据大屏{bindingCount ? ` · ${bindingCount} 个数据绑定` : ""}
          </div>
        </div>
      </div>
      <Button className="h-7 shrink-0 rounded-full px-2" onClick={onOpen} size="sm" variant="outline">
        <ExternalLink className="size-3.5" />
        打开
      </Button>
    </div>
  );
}

function ScreenPreviewPanel({
  artifact,
  onClose,
  onResize,
  width,
}: {
  artifact: Extract<AgentArtifact, { kind: "screen_preview" }>;
  onClose: () => void;
  onResize: (width: number) => void;
  width: number;
}) {
  const [activePreviewTab, setActivePreviewTab] = useState("preview");
  const [previewRenderKey, setPreviewRenderKey] = useState(0);
  const [savingScreen, setSavingScreen] = useState(false);
  const [published, setPublished] = useState(false);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const renderSpec = artifact.data.spec as unknown as JsonRenderSpec;
  const previewTitle = artifact.title ?? "大屏预览";
  const datasetId = renderSpec.meta?.datasetId ?? "";

  async function handleEditScreen() {
    if (savingScreen) {
      return;
    }

    setSavingScreen(true);

    try {
      const response = await createScreen({
        datasetId,
        name: previewTitle,
        prompt: previewTitle,
        spec: renderSpec,
      });

      if (response.ok && response.screen?.id) {
        router.push(`/workbench/screens/new?id=${encodeURIComponent(response.screen.id)}`);
        return;
      }

      setActivePreviewTab("code");
    } finally {
      setSavingScreen(false);
    }
  }

  async function toggleFullscreen() {
    const previewContent = previewCanvasRef.current;

    if (!previewContent) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await previewContent.requestFullscreen();
  }

  return (
    <aside
      className="relative hidden min-h-0 shrink-0 overflow-visible rounded-xl border bg-background shadow-sm lg:flex"
      style={{ width }}
    >
      <PreviewResizeHandle onResize={onResize} width={width} />
      <WebPreview className="h-full overflow-hidden rounded-xl border-0" defaultUrl="agent://screen-preview">
        <WebPreviewNavigation className="h-12 justify-between gap-3 bg-background px-3">
          <div className="flex items-center gap-1">
            <Tabs className="gap-0" onValueChange={setActivePreviewTab} value={activePreviewTab}>
              <TabsList className="h-8 rounded-md border bg-muted/30 p-0.5">
                <TabsTrigger aria-label="预览" className="h-7 w-8 px-0" value="preview">
                  <Eye className="size-4" />
                </TabsTrigger>
                <TabsTrigger aria-label="代码" className="h-7 w-8 px-0" value="code">
                  <Code2 className="size-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex min-w-0 flex-1 justify-center">
            <div className="flex w-full max-w-[420px] items-center gap-1">
              <WebPreviewUrl
                className="h-8 text-center"
                readOnly
                value={published ? `${previewTitle} · 已发布` : previewTitle}
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <WebPreviewNavigationButton
              onClick={() => void handleEditScreen()}
              tooltip={savingScreen ? "保存中" : "编辑"}
            >
              {savingScreen ? <Spinner className="size-4" /> : <Pencil className="size-4" />}
            </WebPreviewNavigationButton>
            <WebPreviewNavigationButton
              onClick={() => setPublished(true)}
              tooltip={published ? "已发布" : "发布"}
            >
              <Rocket className={cn("size-4", published && "text-primary")} />
            </WebPreviewNavigationButton>
            <WebPreviewNavigationButton
              onClick={() => setPreviewRenderKey((current) => current + 1)}
              tooltip="刷新"
            >
              <RefreshCw className="size-4" />
            </WebPreviewNavigationButton>
            {activePreviewTab === "preview" ? (
              <WebPreviewNavigationButton onClick={() => void toggleFullscreen()} tooltip="全屏">
                <Maximize2 className="size-4" />
              </WebPreviewNavigationButton>
            ) : null}
            <WebPreviewNavigationButton onClick={onClose} tooltip="关闭">
              <X className="size-4" />
            </WebPreviewNavigationButton>
          </div>
        </WebPreviewNavigation>

        <div
          className={cn(
            "min-h-0 flex-1 bg-background",
            activePreviewTab === "code" && "overflow-auto p-4",
          )}
        >
          {activePreviewTab === "preview" ? (
            <div
              className="h-full overflow-auto bg-[linear-gradient(to_right,rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:24px_24px]"
              ref={previewCanvasRef}
            >
              <ScreenPreview
                key={previewRenderKey}
                previewData={artifact.data.previewData as unknown as PreviewData}
                spec={renderSpec}
              />
            </div>
          ) : (
            <CodeBlock
              className="border-0 bg-transparent shadow-none"
              code={JSON.stringify(renderSpec, null, 2)}
              language="json"
              showLineNumbers
            >
              <CodeBlockHeader className="rounded-t-lg border bg-muted/40">
                <CodeBlockTitle>
                  <CodeBlockFilename>render-spec.json</CodeBlockFilename>
                </CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton />
                </CodeBlockActions>
              </CodeBlockHeader>
            </CodeBlock>
          )}
        </div>
      </WebPreview>
    </aside>
  );
}

function PreviewResizeHandle({
  onResize,
  width,
}: {
  onResize: (width: number) => void;
  width: number;
}) {
  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = width;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = startWidth - (moveEvent.clientX - startX);
      const maxWidth = Math.round(window.innerWidth * 0.8);
      onResize(Math.min(Math.max(nextWidth, 520), maxWidth));
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <button
      aria-label="调整预览宽度"
      className="group absolute top-1/2 -left-4 z-20 hidden h-28 w-5 -translate-y-1/2 cursor-col-resize items-center justify-center rounded-l-lg border border-r-0 bg-background/95 shadow-sm transition-colors hover:bg-muted lg:flex"
      onPointerDown={handlePointerDown}
      type="button"
    >
      <span className="h-16 w-1 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/60" />
    </button>
  );
}

function getVisibleMessageParts(parts: MessagePart[] = []) {
  return parts.filter((part) => part.type !== "step");
}

function MessagePartList({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="grid min-w-0 gap-3">
      {parts.map((part) =>
        part.type === "tool" ? (
          <ToolList key={part.id} tools={[part.tool]} />
        ) : part.type === "text" ? (
          <MessageResponse className="text-sm leading-7" key={part.id}>
            {part.text}
          </MessageResponse>
        ) : null,
      )}
    </div>
  );
}

function ToolList({ tools }: { tools: AgentTool[] }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      {tools.map((tool) => (
        <Tool defaultOpen={false} key={tool.id} className="mb-0!">
          <ToolHeader
            state={getToolPartState(tool.state)}
            title={tool.name}
            type={getToolPartType(tool)}
          />
          <ToolContent>
            {tool.input === undefined ? null : <ToolInput input={tool.input} />}
            {tool.state === "running" ? (
              <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                <span>工具执行中，等待返回结果...</span>
              </div>
            ) : null}
            <ToolOutput
              errorText={tool.state === "failed" ? (tool.description ?? "执行失败") : undefined}
              output={tool.output}
            />
          </ToolContent>
        </Tool>
      ))}
    </div>
  );
}

function AssistantLoading({ statusText }: { statusText?: string }) {
  return <ThinkingText text={statusText || "正在思考"} />;
}

function MessageRunningBar({ statusText }: { statusText?: string }) {
  return <ThinkingText className="mt-3 text-xs" text={statusText || "正在思考"} />;
}

function ThinkingText({ className, text }: { className?: string; text: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>{text}</span>
      <span className="flex gap-0.5">
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.2s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.1s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground/50" />
      </span>
    </div>
  );
}

function getToolPartState(toolState: AgentTool["state"]) {
  if (toolState === "failed") {
    return "output-error";
  }

  if (toolState === "completed") {
    return "output-available";
  }

  return "input-available";
}

function getToolPartType(tool: AgentTool) {
  const rawType = tool.type || tool.id || "agent";
  return `tool-${rawType.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}` as `tool-${string}`;
}

function getMessageStatusText(message: Message, isStreaming = false) {
  if (message.status === "failed") {
    return "执行失败";
  }

  if (message.status === "completed") {
    return "已完成";
  }

  if (isStreaming || message.status === "running") {
    return "正在处理";
  }

  return "待处理";
}

function normalizeArtifact(payload: Record<string, unknown>): AgentArtifact | null {
  const kind = payload.kind;
  const data = payload.data;

  if (kind === "table" && isRecord(data)) {
    return {
      data: {
        columns: Array.isArray(data.columns) ? data.columns.map(String) : [],
        rows: Array.isArray(data.rows) ? (data.rows as Record<string, unknown>[]) : [],
      },
      id: String(payload.artifactId ?? crypto.randomUUID()),
      kind: "table",
      title: typeof payload.title === "string" ? payload.title : undefined,
    };
  }

  if (kind === "screen_preview" && isRecord(data)) {
    return {
      data: {
        previewData: isRecord(data.previewData) ? data.previewData : {},
        spec: isRecord(data.spec) ? data.spec : {},
      },
      id: String(payload.artifactId ?? crypto.randomUUID()),
      kind: "screen_preview",
      title: typeof payload.title === "string" ? payload.title : undefined,
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function DatasetMentionTag({
  onRemove,
  selectedDataset,
}: {
  onRemove: () => void;
  selectedDataset: Dataset;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-primary/10 px-2 align-middle text-sm font-medium leading-6 text-primary">
      {selectedDataset.name}
      <button
        className="-mr-1 inline-flex size-4 items-center justify-center rounded-sm hover:bg-primary/15"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
        <span className="sr-only">移除数据集</span>
      </button>
    </span>
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
            className="inline-flex max-w-72 items-center gap-2 rounded-full border border-black/5 bg-white px-4 py-3 text-sm text-muted-foreground shadow-[0_4px_14px_rgba(15,23,42,0.08)] transition-colors hover:bg-muted/40 hover:text-foreground"
            key={prompt}
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
