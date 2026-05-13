# 基于数据集的智能体详情设计需求文档

## 1. 背景

当前项目已经具备数据源接入、数据集建模、数据集查询、大屏生成入口和智能小Q对话入口。下一阶段需要把智能体能力建立在已经建模完成的数据集之上，让用户可以围绕一个数据集完成问数和大屏搭建两个核心操作。

智能体不是直接访问数据库表，也不是自由拼 SQL。智能体必须消费数据集语义模型，通过统一的 DatasetProfile、Dataset Query Layer 和受约束的工具调用完成分析。所有问数回答和大屏生成建议都必须可追溯到数据集字段、查询请求和查询结果。

## 2. 目标

用户选择一个已经建模完成的数据集，输入自然语言问题，例如：

- 本月销售数量是多少
- 按渠道看销售数量排行
- 哪些区域销售金额最高
- 基于这个数据集生成一个经营分析大屏

系统需要完成：

1. 读取当前 dataset 的 DatasetProfile。
2. 识别用户意图和需要使用的字段。
3. 生成受约束的 DatasetQueryRequest。
4. 调用 Dataset Query Layer 执行真实查询。
5. 基于查询结果生成回答、表格结果或大屏生成计划。
6. 通过标准化 event 流向前端输出过程和结果。
7. 保留可审计的 query、field binding、tool result 和 answer trace。

## 3. 核心原则

1. 唯一数据语义来源是 `dataset`。
2. 智能体不能绕过 dataset 直接查询物理表。
3. 智能体不能生成自由 SQL；只能生成受约束的 DatasetQueryRequest。
4. 所有字段绑定必须使用稳定 `field_id`，展示时使用字段别名。
5. 多表数据集查询必须沿用 `datasets.relationships`。
6. 计算字段必须由后端表达式编译器处理。
7. 前端只消费 event，不推断智能体内部状态。
8. 所有事件必须有统一 envelope，便于调试、回放和审计。
9. 本期智能体只做单 dataset，不做跨 dataset 联合分析。
10. 智能体可以在问数回答中解释查询结果，但不提供独立的数据洞察、报告或建模修改能力。

## 4. 术语

| 术语 | 说明 |
| --- | --- |
| Dataset | 用户已经建好的逻辑数据模型 |
| DatasetProfile | 从 dataset 提取出的标准化语义画像 |
| AgentSession | 一次用户与智能体的对话会话 |
| AgentRun | 一次用户提问触发的智能体运行 |
| AgentPlan | 智能体根据问题生成的分析计划 |
| ToolCall | 智能体调用的受控工具 |
| DatasetQueryRequest | 数据集统一查询请求 |
| DatasetQueryResult | 数据集统一查询结果 |
| AgentEvent | 智能体运行过程向前端发送的标准事件 |
| Trace | 一次运行的计划、工具、结果和回答记录 |

## 5. 本期范围

### 5.1 本期包含

- 单 dataset 对话。
- 基于 DatasetProfile 的字段理解。
- 指标查询、维度拆解、趋势查询、明细查询。
- 简单筛选条件识别。
- 基于查询结果生成文本回答。
- 基于查询结果返回表格数据。
- 输出标准 SSE event。
- 支持智能体调用大屏生成能力。
- 支持运行过程展示。
- 支持错误事件、完成事件和可恢复的前端渲染。

### 5.2 暂不包含

- 跨 dataset 问数。
- 自由 SQL。
- 自动修改数据集字段、关联关系或计算字段。
- 复杂多轮记忆。
- 权限体系。
- 指标口径审批。
- 数据洞察、报告生成、字段搜索等独立能力。
- 高级预测、归因和因果分析。
- 文件上传后直接问数。
- 多智能体协同。

## 6. 用户流程

### 6.1 问数流程

1. 用户进入智能小Q页面。
2. 用户选择 dataset。
3. 用户输入自然语言问题。
4. 前端创建 AgentRun，请求后端流式接口。
5. 后端发送 `run.started`。
6. 后端读取 DatasetProfile。
7. 后端生成 AgentPlan。
8. 后端调用 Dataset Query Tool。
9. 后端根据查询结果生成回答。
10. 前端按 event 渲染过程、结果和最终回答。
11. 后端发送 `run.completed`。

### 6.2 大屏搭建流程

1. 用户在智能体中输入搭建类需求。
2. 智能体识别 `intent = build_screen`。
3. 智能体生成 ScreenGenerationRequest。
4. 调用大屏生成工具。
5. 工具返回 `spec`、`queryBindings`、`previewData`。
6. 前端展示大屏预览入口。
7. 用户进入大屏编辑页继续调整。

### 6.3 过程查看流程

1. 前端收到 `plan.created` 后展示分析计划。
2. 前端收到 `tool.started` 后展示正在查询。
3. 前端收到 `tool.completed` 后展示查询结果摘要。
4. 前端收到 `answer.delta` 后流式追加回答文本。
5. 前端收到 `run.completed` 后标记本次回答完成。

## 7. 整体架构

```text
User Message
  -> Agent API
  -> Agent Session / Run
  -> DatasetProfile Loader
  -> Intent Planner
  -> Field Resolver
  -> Query Planner
  -> Tool Executor
  -> Answer Composer
  -> Agent Event Stream
  -> Frontend Renderer

Dataset
  -> DatasetProfile
  -> Dataset Query Layer
  -> DatasetQueryResult
  -> Agent Answer / Table / Screen Generation
```

系统分层：

1. Agent API Layer：接收消息、创建 run、输出事件流。
2. Context Layer：读取 dataset、历史消息和用户输入。
3. Planning Layer：识别意图、字段、查询类型和工具调用顺序。
4. Tool Layer：执行 dataset profile、dataset query、screen generation 三类工具。
5. Answer Layer：把结构化结果组织成可读回答。
6. Event Layer：把过程和结果转成统一事件。
7. UI Layer：按事件渲染消息、过程、表格和操作入口。

## 8. 智能体能力设计

### 8.1 能力列表

| 能力 | intent | 说明 |
| --- | --- | --- |
| 问数 | `query_metric` | 查询单个或多个指标 |
| 拆解 | `breakdown` | 按维度分组、排行、对比 |
| 趋势 | `trend` | 按时间字段聚合 |
| 明细 | `table` | 返回明细表格 |
| 大屏搭建 | `build_screen` | 调用大屏生成工具 |

### 8.2 MVP 意图识别

本期可以先采用规则 + LLM 结构化输出的混合方式：

1. 规则先识别强意图：
   - 包含“生成大屏、搭建大屏、看板” -> `build_screen`
   - 包含“趋势、变化、按月、按天、按周” -> `trend`
   - 包含“按、排行、分布、占比、对比” -> `breakdown`
   - 包含“明细、列表、详情、记录” -> `table`
2. 其他问题交给 LLM 输出结构化 AgentPlan。
3. LLM 输出必须经过字段校验和工具参数校验。

## 9. 数据集上下文

智能体输入的 dataset 上下文必须使用 DatasetProfile。

```ts
type DatasetProfile = {
  datasetId: string;
  datasetName: string;
  datasourceId: string;
  sourceTables: string[];
  relationships: Array<{
    leftTable: string;
    rightTable: string;
    joinType: "left" | "right" | "inner" | "full";
    conditions: Array<{
      leftField: string;
      operator: string;
      rightField: string;
    }>;
  }>;
  fields: Array<{
    fieldId: string;
    displayName: string;
    sourceName: string;
    sourceTable?: string | null;
    sourceField?: string | null;
    dataType: string;
    semanticType: "dimension" | "measure" | "time";
    aggregation?: "sum" | "avg" | "count" | "max" | "min" | null;
    fieldKind: "source" | "calculated";
    expression?: Record<string, unknown> | null;
    selected: boolean;
  }>;
  measures: string[];
  dimensions: string[];
  timeFields: string[];
  defaultTimeField?: string;
};
```

字段使用规则：

1. `fieldId` 用于绑定和查询。
2. `displayName` 用于展示和回答。
3. `sourceName/sourceTable/sourceField` 只用于后端回源和调试，不向用户暴露。
4. `semanticType` 决定字段能否作为指标、维度或时间字段。
5. `aggregation` 是指标默认聚合方式。

## 10. AgentPlan 设计

AgentPlan 是智能体运行的中间结构，不直接暴露给用户，但会通过 `plan.created` event 提供可读摘要。

```ts
type AgentPlan = {
  intent:
    | "query_metric"
    | "breakdown"
    | "trend"
    | "table"
    | "build_screen";
  datasetId: string;
  question: string;
  reasoningSummary?: string;
  fields: {
    measures: string[];
    dimensions: string[];
    time?: string | null;
  };
  filters: Array<{
    field: string;
    op: "=" | "!=" | "in" | ">" | "<" | ">=" | "<=";
    value: unknown;
  }>;
  queryType?: "metric" | "trend" | "breakdown" | "table";
  granularity?: "day" | "week" | "month";
  limit?: number;
  tools: ToolCallPlan[];
};
```

```ts
type ToolCallPlan = {
  tool: "dataset.profile" | "dataset.query" | "screen.generate";
  input: Record<string, unknown>;
};
```

校验规则：

1. `fields.measures` 必须来自 `DatasetProfile.measures`。
2. `fields.dimensions` 必须来自 `DatasetProfile.dimensions`。
3. `fields.time` 必须来自 `DatasetProfile.timeFields`。
4. filters 字段必须来自 DatasetProfile.fields。
5. queryType 和字段组合必须匹配。
6. 不允许使用不存在的字段名或 displayName 作为绑定主键。

## 11. 工具定义

### 11.1 dataset.profile

读取数据集语义画像。

```ts
type DatasetProfileToolInput = {
  datasetId: string;
};
```

```ts
type DatasetProfileToolOutput = {
  profile: DatasetProfile;
};
```

### 11.2 dataset.query

执行受约束的数据集查询。

```ts
type DatasetQueryToolInput = {
  datasetId: string;
  query: DatasetQueryRequest;
};
```

```ts
type DatasetQueryRequest = {
  queryType: "metric" | "trend" | "breakdown" | "table";
  dimensions: Array<{
    field: string;
    alias?: string;
  }>;
  measures: Array<{
    field: string;
    aggregation: "sum" | "avg" | "count" | "max" | "min";
    alias: string;
  }>;
  filters: Array<{
    field: string;
    op: "=" | "!=" | "in" | ">" | "<" | ">=" | "<=";
    value: unknown;
  }>;
  sort: Array<{
    field: string;
    direction: "asc" | "desc";
  }>;
  limit?: number;
  granularity?: "day" | "week" | "month";
};
```

```ts
type DatasetQueryToolOutput = {
  result:
    | { type: "metric"; value: number | null }
    | { type: "trend"; points: Array<{ x: string; y: number | null }> }
    | { type: "breakdown"; items: Array<{ label: string; value: number | null }> }
    | { type: "table"; columns: string[]; rows: Array<Record<string, unknown>> };
};
```

### 11.3 screen.generate

调用基于数据集的大屏生成能力。

```ts
type ScreenGenerateToolInput = {
  datasetId: string;
  prompt: string;
  theme?: "dark" | "light";
  width?: number;
  height?: number;
};
```

```ts
type ScreenGenerateToolOutput = {
  name: string;
  datasetId: string;
  spec: Record<string, unknown>;
  queryBindings: Record<string, unknown>;
  previewData: Record<string, unknown>;
  warnings: string[];
};
```

## 12. Event 设计原则

事件用于前后端解耦，也用于后续回放和审计。所有智能体输出必须通过统一 envelope。

原则：

1. 所有 event 必须包含 `eventId`、`runId`、`type`、`createdAt`。
2. event 必须可追加、可回放。
3. event payload 必须是 JSON object。
4. 流式文本只允许通过 `answer.delta` 输出。
5. 最终回答必须通过 `answer.completed` 输出完整内容。
6. 工具调用必须有 started 和 completed 或 failed。
7. 错误必须通过 `tool.failed` 或 `run.failed` 输出，不能只断流。
8. `run.completed` 是一次运行的唯一正常结束信号。
9. `run.failed` 是一次运行的唯一异常结束信号。
10. 前端不能依赖 event 顺序之外的隐式状态。

## 13. Event Envelope

```ts
type AgentEvent<T = Record<string, unknown>> = {
  eventId: string;
  runId: string;
  sessionId: string;
  type: AgentEventType;
  sequence: number;
  createdAt: string;
  payload: T;
};
```

```ts
type AgentEventType =
  | "run.started"
  | "context.loaded"
  | "plan.created"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "answer.delta"
  | "answer.completed"
  | "artifact.created"
  | "run.completed"
  | "run.failed";
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| eventId | 单个事件唯一 ID |
| runId | 本次用户提问运行 ID |
| sessionId | 对话会话 ID |
| type | 事件类型 |
| sequence | 当前 run 内递增序号，从 1 开始 |
| createdAt | ISO 时间 |
| payload | 事件内容 |

## 14. Event Payload 规范

### 14.1 run.started

表示一次智能体运行开始。

```ts
type RunStartedPayload = {
  datasetId: string;
  message: string;
  capability: "qa" | "builder";
};
```

### 14.2 context.loaded

表示数据集上下文已加载完成。

```ts
type ContextLoadedPayload = {
  dataset: {
    datasetId: string;
    datasetName: string;
  };
  fieldStats: {
    measures: number;
    dimensions: number;
    timeFields: number;
  };
};
```

### 14.3 plan.created

表示智能体完成计划生成。

```ts
type PlanCreatedPayload = {
  intent: AgentPlan["intent"];
  summary: string;
  fields: {
    measures: Array<{ fieldId: string; displayName: string }>;
    dimensions: Array<{ fieldId: string; displayName: string }>;
    time?: { fieldId: string; displayName: string } | null;
  };
  tools: Array<{
    tool: string;
    label: string;
  }>;
};
```

### 14.4 tool.started

表示开始调用工具。

```ts
type ToolStartedPayload = {
  toolCallId: string;
  tool: "dataset.profile" | "dataset.query" | "screen.generate";
  label: string;
  inputSummary?: string;
};
```

### 14.5 tool.completed

表示工具调用成功。

```ts
type ToolCompletedPayload = {
  toolCallId: string;
  tool: "dataset.profile" | "dataset.query" | "screen.generate";
  outputSummary?: string;
  resultPreview?: unknown;
};
```

约束：

- `resultPreview` 只返回用于 UI 展示的摘要，不返回完整大对象。
- 完整查询结果如需展示，应通过 `artifact.created` 输出为结构化 artifact。

### 14.6 tool.failed

表示工具调用失败。

```ts
type ToolFailedPayload = {
  toolCallId: string;
  tool: string;
  message: string;
  recoverable: boolean;
};
```

### 14.7 answer.delta

表示回答文本增量。

```ts
type AnswerDeltaPayload = {
  text: string;
};
```

约束：

- `text` 必须是可直接追加到 assistant message 的文本。
- 不允许在 `answer.delta` 里混入 JSON 控制信息。

### 14.8 answer.completed

表示最终回答文本完成。

```ts
type AnswerCompletedPayload = {
  text: string;
};
```

### 14.9 artifact.created

表示生成结构化结果，例如表格或大屏预览。

```ts
type ArtifactCreatedPayload =
  | {
      artifactId: string;
      kind: "table";
      title?: string;
      data: {
        columns: string[];
        rows: Array<Record<string, unknown>>;
      };
    }
  | {
      artifactId: string;
      kind: "screen_preview";
      title?: string;
      data: {
        spec: Record<string, unknown>;
        queryBindings: Record<string, unknown>;
        previewData: Record<string, unknown>;
      };
    };
```

### 14.10 run.completed

表示本次运行正常结束。

```ts
type RunCompletedPayload = {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  durationMs: number;
};
```

### 14.11 run.failed

表示本次运行异常结束。

```ts
type RunFailedPayload = {
  message: string;
  code:
    | "DATASET_NOT_FOUND"
    | "PROFILE_LOAD_FAILED"
    | "PLAN_FAILED"
    | "TOOL_FAILED"
    | "QUERY_FAILED"
    | "ANSWER_FAILED"
    | "UNKNOWN";
  recoverable: boolean;
};
```

## 15. SSE 传输规范

智能体接口使用 SSE。

```http
POST /api/agent/runs
Content-Type: application/json
Accept: text/event-stream
```

请求：

```ts
type CreateAgentRunRequest = {
  sessionId?: string;
  datasetId: string;
  message: string;
  capability?: "qa" | "builder";
};
```

响应：

```text
event: run.started
data: {"eventId":"evt_...","runId":"run_...","sessionId":"ses_...","type":"run.started","sequence":1,"createdAt":"...","payload":{...}}

event: context.loaded
data: {...}

event: answer.delta
data: {...}

event: run.completed
data: {...}
```

传输要求：

1. SSE `event` 名必须等于 AgentEvent.type。
2. SSE `data` 必须是完整 AgentEvent JSON。
3. 服务端必须按 sequence 顺序发送。
4. 前端收到未知 event type 时应忽略并记录。
5. 网络断开时，本期前端可提示重试；后续可支持基于 runId 回放。

## 16. 前端渲染规范

前端不根据文本内容推断状态，只根据 event type 渲染。

| event | UI 行为 |
| --- | --- |
| run.started | 新增 assistant message，显示运行中 |
| context.loaded | 展示当前数据集名称和字段统计 |
| plan.created | 展示分析计划摘要 |
| tool.started | 展示工具调用进行中 |
| tool.completed | 标记工具调用完成 |
| tool.failed | 展示工具错误 |
| answer.delta | 追加回答文本 |
| answer.completed | 固化完整回答 |
| artifact.created | 渲染表格或大屏预览 |
| run.completed | 标记回答完成 |
| run.failed | 标记失败并展示错误 |

## 17. 后端接口设计

### 17.1 创建运行

```http
POST /api/agent/runs
```

输入：

```json
{
  "sessionId": "ses_xxx",
  "datasetId": "dataset_xxx",
  "message": "按渠道看销售数量排行",
  "capability": "qa"
}
```

输出：SSE event stream。

### 17.2 获取会话列表

```http
GET /api/agent/sessions
```

### 17.3 获取会话详情

```http
GET /api/agent/sessions/{sessionId}
```

### 17.4 获取运行事件

```http
GET /api/agent/runs/{runId}/events
```

用于后续回放、调试和重新渲染。

## 18. 存储设计

### 18.1 agent_sessions

```sql
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'zhourukun',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 18.2 agent_runs

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  dataset_id TEXT NOT NULL,
  message TEXT NOT NULL,
  capability TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error JSONB
);
```

### 18.3 agent_events

```sql
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, sequence)
);
```

### 18.4 agent_artifacts

```sql
CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 19. 错误处理

| 场景 | event | code |
| --- | --- | --- |
| 未选择数据集 | run.failed | DATASET_NOT_FOUND |
| 数据集不存在 | run.failed | DATASET_NOT_FOUND |
| 数据集字段为空 | run.failed | PROFILE_LOAD_FAILED |
| 无法生成计划 | run.failed | PLAN_FAILED |
| 工具调用失败 | tool.failed + run.failed | TOOL_FAILED |
| 查询失败 | tool.failed + run.failed | QUERY_FAILED |
| 回答生成失败 | run.failed | ANSWER_FAILED |

错误输出原则：

1. 用户可理解的错误写入 `payload.message`。
2. 技术细节写入 trace，不直接展示。
3. 可恢复错误 `recoverable = true`。
4. 不允许只断开 SSE 而不发送 `run.failed`。

## 20. 安全与权限

1. 智能体只能查询当前用户有权限访问的 dataset。
2. 数据库密码不落库，智能体不得要求或展示数据源密码。
3. 智能体不能执行 DDL、DML 或自由 SQL。
4. artifact 中不得包含连接凭证。
5. 工具调用参数需要经过 schema 校验。
6. LLM 输出不能直接进入执行层，必须经过 planner validator。

## 21. 与大屏生成的关系

智能体的 `build_screen` intent 不直接生成页面 spec，而是调用大屏生成工具。

```text
Agent
  -> intent = build_screen
  -> screen.generate tool
  -> dataset-driven screen generation
  -> spec / queryBindings / previewData
  -> artifact.created(kind = screen_preview)
```

这样可以保证：

1. 大屏生成仍然遵循 dataset-driven-screen-generation 文档。
2. 智能体只负责理解用户意图和发起工具调用。
3. 大屏 spec 编译逻辑保持确定性。
4. 后续低代码编辑仍然使用同一份 json-render spec。

## 22. MVP 实现顺序

### 阶段 1：事件协议和最小问数

1. 新增 `/api/agent/runs` SSE 接口。
2. 定义 AgentEvent envelope。
3. 前端按 event type 渲染。
4. 后端支持 dataset.profile 和 dataset.query 两个工具。
5. 支持 metric、breakdown、trend、table 四类基础查询。

### 阶段 2：LLM 计划生成

1. 增加结构化 AgentPlan 输出。
2. 增加字段匹配和字段校验。
3. 增加 plan.created event。
4. 增加 tool started/completed/failed event。
5. 增加回答生成。

### 阶段 3：大屏搭建接入

1. 支持 `build_screen` intent。
2. 接入 screen.generate tool。
3. 输出 screen_preview artifact。
4. 前端展示预览和进入编辑入口。

### 阶段 4：会话和回放

1. 落库 agent_sessions。
2. 落库 agent_runs。
3. 落库 agent_events。
4. 支持运行历史和事件回放。

## 23. 验收标准

1. 用户必须先选择 dataset 才能提问。
2. 前端接收的每条事件都符合 AgentEvent envelope。
3. 问数回答使用真实 DatasetQueryResult。
4. 回答中展示字段使用 displayName，不展示 fieldId。
5. 表格 artifact 列名使用字段别名。
6. 错误场景必须输出 `run.failed`。
7. 工具调用必须输出 started 和 completed 或 failed。
8. 大屏搭建必须通过 screen.generate tool，而不是智能体直接生成 spec。
9. 后端 trace 能还原一次运行使用了哪些字段、工具和查询。
10. 不允许绕过 dataset 直接访问物理表。
