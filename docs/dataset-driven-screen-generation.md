# 基于数据集的 AI 大屏生成与低代码编辑需求文档

## 1. 背景

当前项目已经具备数据源接入、数据集建模、基础大屏入口和 Agent 对话入口。下一阶段需要在现有能力之上，建设一套基于数据集自动生成数据大屏的能力。

该能力不是通用页面生成器，而是围绕项目已有的数据集建模结果进行页面搭建。系统需要读取数据集最终可查询的数据，通过 LangGraph 完成页面规划、组件选择、字段绑定、数据校验，并输出统一的 `json-render` 页面协议。生成后的页面需要立即可预览，并可以进入低代码编辑器继续调整，最终发布态仍然使用同一套 `json-render` 渲染。

## 2. 目标

用户选择一个已经建模完成的数据集，输入自然语言需求，例如：

- 基于销售数据集生成经营总览大屏
- 给区域销售数据集搭一个趋势分析大屏
- 按渠道、品类、区域生成销售分析看板

系统自动完成：

1. 读取数据集模型。
2. 基于数据集最终可查询的数据生成页面规划。
3. 生成 `json-render spec`。
4. 立即渲染预览。
5. 进入低代码编辑器继续编辑。
6. 保存草稿。
7. 发布页面。

## 3. 核心原则

1. 唯一数据语义来源是 `dataset`。
2. 唯一页面渲染协议是 `json-render spec`。
3. 生成后预览、低代码编辑画布、最终发布页面都使用 `json-render` 渲染。
4. 所有自动生成组件都必须能基于当前 dataset 的真实查询结果运行。
5. 页面生成和编辑不能绕过数据集模型直接拼表或自由查询。
6. 多表数据集查询必须沿用 `datasets.relationships`。
7. 低代码编辑只修改页面 spec、组件属性和数据绑定，不修改 dataset 建模规则。

## 4. 术语

| 术语 | 说明 |
| --- | --- |
| Dataset | 用户已经建好的逻辑数据模型 |
| DatasetProfile | 从 dataset 提取出的标准化语义画像 |
| ScreenPlan | LangGraph 生成的页面规划中间结构 |
| json-render spec | 页面统一渲染协议 |
| QueryBindings | 组件和数据查询之间的绑定定义 |
| PreviewData | 基于 QueryBindings 实际查询得到的组件数据 |
| Screen | 保存到系统中的大屏实体 |
| Low-code Editor | 面向 `json-render spec` 的可视化编辑器 |

## 5. 范围

### 5.1 本期范围

- 单 dataset 建屏。
- PostgreSQL 数据源优先。
- 基于 dataset 最终查询结果生成页面。
- 生成后直接预览。
- 支持基础低代码编辑。
- 支持草稿保存。
- 支持发布。
- 使用 `json-render` 作为所有阶段的统一渲染引擎。
- 支持 3 套模板。
- 支持 5 类业务组件。

### 5.2 暂不包含

- 跨 dataset 联屏。
- 自定义 SQL。
- 多人协作编辑。
- 高级联动筛选。
- 自定义组件市场。
- 复杂表达式编辑器。
- 多主题系统。
- 任意组件自由嵌套。

## 6. 现有数据集建模约束

系统必须遵守当前仓库已经实现的数据集建模规则：

1. 只允许使用 `selected = true` 的字段。
2. `semantic_type = measure` 的字段用于指标类组件。
3. `semantic_type = dimension` 的字段用于分类、分组、排行类组件。
4. `semantic_type = time` 的字段用于时间趋势类组件。
5. `aggregation` 是指标默认聚合方式。
6. 多表 dataset 的查询必须沿用 `datasets.relationships`。
7. `display_name` 用于页面展示。
8. `source_name` 用于回源查询。
9. `field_kind = calculated` 的字段允许进入页面，但必须由后端表达式编译器处理。
10. 字段别名在 dataset 内必须唯一。
11. 页面消费 dataset，不重新定义数据集关系。

## 7. 用户流程

### 7.1 生成预览流程

1. 用户进入大屏创建页。
2. 用户选择 dataset。
3. 用户输入自然语言需求。
4. 用户点击生成。
5. 后端运行 LangGraph 生成流程。
6. 后端返回 `spec`、`queryBindings`、`previewData`。
7. 前端用 `json-render` 立即渲染页面预览。

### 7.2 低代码编辑流程

1. 用户在预览页点击进入编辑。
2. 系统进入低代码编辑页。
3. 左侧展示节点树。
4. 中间画布使用 `json-render` 渲染当前 spec。
5. 右侧属性面板编辑节点属性和数据绑定。
6. 用户修改字段绑定后，系统刷新对应组件数据。
7. 用户保存草稿。

### 7.3 发布流程

1. 用户点击发布。
2. 系统将当前 screen 状态标记为 `published`。
3. 发布态页面仍然使用同一份 `json-render spec` 渲染。

## 8. 整体架构

```text
Dataset
  -> DatasetProfile
  -> LangGraph
  -> ScreenPlan
  -> Spec Compiler
  -> json-render Spec
  -> json-render Preview / Editor Canvas / Published Page

Dataset
  -> Query Planner
  -> Query Executor
  -> PreviewData
  -> json-render Components
```

系统分层：

1. Dataset Model Layer：现有数据集建模层。
2. Dataset Query Layer：统一查询规划和执行。
3. AI Planning Layer：LangGraph 生成 ScreenPlan。
4. Spec Compiler Layer：ScreenPlan 编译为 `json-render spec`。
5. Render Layer：`json-render` 统一渲染。
6. Editor Layer：对 spec 和 bindings 的可视化编辑。

### 8.1 主流处理方式与本项目选型

在 AI BI、自然语言可视化、智能大屏生成等场景中，主流做法通常不是让大模型一步直接生成最终页面 JSON 或前端代码，而是采用分层生成、分步校验、最终编译的链路：

```text
Dataset / Semantic Layer
  -> Intent / Analytic Plan
  -> Query / Validation
  -> Render Spec
  -> Preview / Edit / Publish
```

这样处理的原因是：

1. 大模型直接生成最终页面协议时，容易生成不存在的字段。
2. 大模型容易选择不适合当前数据分布的图表。
3. 复杂 spec 中的节点 id、children 引用、layout、props 容易出现结构错误。
4. 页面可能能渲染，但数据口径不一定正确。
5. 后续低代码编辑需要稳定、可追踪、可校验的中间结构。

因此，本项目采用主流的“两阶段生成”策略：

```text
先生成 ScreenPlan
再编译 json-render spec
```

具体职责边界如下：

| 层级 | 职责 | 是否使用大模型 |
| --- | --- | --- |
| DatasetProfile | 读取和整理数据集语义 | 否 |
| ScreenPlan | 选择模板、组件、字段和绑定 | 是 |
| Preview Query | 基于真实数据执行查询 | 否 |
| Validation / Repair | 校验并修正不合理组件 | 优先程序规则，必要时可使用大模型 |
| Spec Compiler | 将 ScreenPlan 编译成 `json-render spec` | 否 |
| json-render | 统一渲染预览、编辑、发布 | 否 |

该方案的核心收益：

- 业务规划和渲染协议解耦。
- 页面生成过程可调试、可校验、可回退。
- 低代码编辑器可以围绕稳定的 spec 和 bindings 工作。
- 后续更换模板、扩展组件、优化布局时，不需要重写智能体整体流程。

在本项目首期实现中，大模型只负责生成 `ScreenPlan`，不直接自由生成最终 `json-render spec`。最终 spec 由后端确定性 compiler 根据模板、catalog 和 ScreenPlan 生成。

## 9. 数据结构设计

### 9.1 DatasetProfile

`DatasetProfile` 是 LangGraph 的主要输入之一，由后端从现有 dataset 详情中构造。

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
    sourceName: string; // 兼容展示/历史数据，查询优先使用 sourceTable + sourceField
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

### 9.2 ScreenPlan

LangGraph 不直接生成最终 spec，而是先生成受约束的 `ScreenPlan`。

```ts
type ScreenPlan = {
  title: string;
  template: "executive_overview" | "trend_analysis" | "dimension_breakdown";
  theme: "dark" | "light";
  widgets: WidgetPlan[];
  warnings: string[];
};

type WidgetPlan = {
  id: string;
  slot: string;
  widgetType: "metric" | "line" | "bar" | "pie" | "table";
  title: string;
  bindingKey: string;
  binding: WidgetBindingPlan;
};

type WidgetBindingPlan = {
  queryType: "metric" | "trend" | "breakdown" | "table";
  fields: {
    measure?: string;
    dimension?: string;
    time?: string;
  };
  aggregation?: "sum" | "avg" | "count" | "max" | "min";
  granularity?: "day" | "week" | "month";
  filters?: Array<{
    field: string;
    op: "=" | "!=" | "in" | ">" | "<" | ">=" | "<=";
    value: unknown;
  }>;
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
  format?: "number" | "currency" | "percent";
  showComparison?: boolean;
};
```

### 9.3 json-render spec

所有渲染阶段统一使用该结构。

```ts
type JsonRenderSpec = {
  version: "1.0";
  root: string;
  meta?: {
    datasetId: string;
    title: string;
    template: "executive_overview" | "trend_analysis" | "dimension_breakdown";
    theme?: "dark" | "light";
  };
  elements: Record<string, JsonRenderNode>;
};

type JsonRenderNode = {
  type: string;
  props: Record<string, unknown>;
  children: string[];
};
```

### 9.4 QueryBindings

组件通过 `bindingKey` 和查询定义关联。

```ts
type QueryBindings = Record<string, WidgetQueryBinding>;

type WidgetQueryBinding = {
  widgetId: string;
  datasetId: string;
  queryType: "metric" | "trend" | "breakdown" | "table";
  fields: {
    measure?: string;
    dimension?: string;
    time?: string;
  };
  aggregation?: "sum" | "avg" | "count" | "max" | "min";
  granularity?: "day" | "week" | "month";
  filters?: Array<{
    field: string;
    op: "=" | "!=" | "in" | ">" | "<" | ">=" | "<=";
    value: unknown;
  }>;
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
  limit?: number;
  display?: {
    format?: "number" | "currency" | "percent";
    decimals?: number;
    showComparison?: boolean;
  };
};
```

### 9.5 PreviewData

```ts
type PreviewData = Record<string, WidgetResult>;

type WidgetResult =
  | MetricResult
  | TrendResult
  | BreakdownResult
  | TableResult;

type MetricResult = {
  type: "metric";
  value: number | null;
  compareValue?: number | null;
  changeValue?: number | null;
  changeRate?: number | null;
};

type TrendResult = {
  type: "trend";
  points: Array<{
    x: string;
    y: number | null;
  }>;
};

type BreakdownResult = {
  type: "breakdown";
  items: Array<{
    label: string;
    value: number | null;
  }>;
};

type TableResult = {
  type: "table";
  columns: string[];
  rows: Array<Record<string, unknown>>;
};
```

## 10. LangGraph 生成流程

### 10.1 State

```py
class ScreenGenState(TypedDict):
    request: str
    dataset_id: str
    theme: str
    width: int
    height: int
    dataset_profile: dict | None
    screen_goal: str | None
    template: str | None
    screen_plan: dict | None
    query_bindings: dict
    preview_data: dict
    render_spec: dict | None
    warnings: list[str]
    errors: list[str]
```

### 10.2 节点

1. `load_dataset_profile`
   - 输入：`dataset_id`
   - 输出：`dataset_profile`
   - 职责：读取 dataset、fields、relationships，构造语义画像。

2. `infer_screen_goal`
   - 输入：`request`、`dataset_profile`
   - 输出：`screen_goal`
   - 职责：识别经营总览、趋势分析、维度拆解等目标。

3. `choose_template`
   - 输入：`screen_goal`、`dataset_profile`
   - 输出：`template`
   - 职责：选择固定页面模板。

4. `build_screen_plan`
   - 输入：`template`、`dataset_profile`、`request`
   - 输出：`screen_plan`
   - 职责：选择组件、字段、槽位和绑定。

5. `build_query_bindings`
   - 输入：`screen_plan`
   - 输出：`query_bindings`
   - 职责：将 widget binding 平铺为查询绑定 map。

6. `run_preview_queries`
   - 输入：`dataset_profile`、`query_bindings`
   - 输出：`preview_data`
   - 职责：执行真实查询。

7. `validate_and_repair_plan`
   - 输入：`screen_plan`、`preview_data`
   - 输出：修复后的 `screen_plan` 和 `warnings`
   - 职责：基于真实数据结果修正组件。

8. `compile_render_spec`
   - 输入：`screen_plan`、`query_bindings`
   - 输出：`render_spec`
   - 职责：确定性编译为 `json-render spec`。

## 11. 真实数据校验规则

1. KPI 查询为空：
   - 移除该组件，或返回 warning。

2. 趋势点位少于 2：
   - 降级为 metric 或 table。

3. 饼图分类数大于 8：
   - 降级为 bar。

4. 分类图查询为空：
   - 替换字段或移除组件。

5. 多表关联结果异常：
   - 返回 warning，提示检查 dataset relationships。

6. calculated field 编译失败：
   - 不使用该字段，并返回 warning。

原则：

- 优先小修。
- 不过度魔改。
- 无法自动修复时保留 warning。
- 不允许明显无效组件进入最终预览。

## 12. 模板设计

### 12.1 executive_overview

适用：经营总览、驾驶舱、概览类需求。

包含：

- Header
- 4 个 KPI
- 1 个主趋势图
- 1 个分类拆解图
- 1 个排行或明细表

### 12.2 trend_analysis

适用：趋势、同比、环比、时间序列分析。

包含：

- Header
- 2 个 KPI
- 2-3 个趋势图
- 1 个明细表

### 12.3 dimension_breakdown

适用：区域、渠道、品类、部门等维度拆解。

包含：

- Header
- 2 个 KPI
- 2 个分类拆解图
- 1 个排行表
- 1 个明细表

## 13. 组件 Catalog

首期 `json-render` catalog：

| 节点类型 | 说明 |
| --- | --- |
| DashboardRoot | 页面根节点 |
| SectionHeader | 页面标题区 |
| GridLayout | 栅格布局 |
| Panel | 通用图表容器 |
| MetricCard | 指标卡 |
| LineChart | 趋势图 |
| BarChart | 分类柱图 |
| PieChart | 饼图 |
| DataTable | 表格 |

首期业务组件：

| 业务类型 | json-render 节点 |
| --- | --- |
| metric | MetricCard |
| line | LineChart |
| bar | BarChart |
| pie | PieChart |
| table | DataTable |

## 14. 组件生成约束

### 14.1 MetricCard

- 必须绑定 `measure`。
- 必须有聚合方式。
- 优先使用字段默认 aggregation。

### 14.2 LineChart

- 必须绑定 `measure + time`。
- 默认粒度为 `month`。
- 时间字段不存在时不能生成。

### 14.3 BarChart

- 必须绑定 `measure + dimension`。
- 默认 TopN。
- 高基数维度允许用于 bar，但必须限制 limit。

### 14.4 PieChart

- 必须绑定 `measure + dimension`。
- 维度类别数不应超过 8。
- 高基数维度自动降级为 bar。

### 14.5 DataTable

- 可使用 dimension、time、measure。
- 默认 5-8 列。
- 默认 limit 20。

## 15. Query Planner 需求

Query Planner 负责将组件绑定转成可执行查询。

必须支持：

- 单表 dataset。
- 多表 dataset。
- source field。
- calculated field。
- metric 查询。
- trend 查询。
- breakdown 查询。
- table 查询。
- filters。
- sort。
- limit。
- time granularity。

### 15.1 查询请求

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

### 15.2 calculated field

首期只支持二元表达式：

- `leftFieldKey`
- `operator`
- `rightFieldKey`

允许操作符：

- `+`
- `-`
- `*`
- `/`

禁止：

- 任意 SQL 片段。
- 函数调用。
- 嵌套表达式。

## 16. API 需求

### 16.1 生成预览

`POST /api/screens/generate-preview`

请求：

```json
{
  "dataset_id": "dataset_sales",
  "prompt": "生成销售经营总览大屏",
  "theme": "dark",
  "size": {
    "width": 1920,
    "height": 1080
  }
}
```

响应：

```json
{
  "ok": true,
  "screen": {
    "name": "销售经营总览",
    "datasetId": "dataset_sales",
    "spec": {},
    "queryBindings": {},
    "previewData": {},
    "meta": {
      "template": "executive_overview",
      "warnings": []
    }
  }
}
```

### 16.2 刷新预览数据

`POST /api/screens/preview-data`

请求：

```json
{
  "dataset_id": "dataset_sales",
  "queryBindings": {}
}
```

响应：

```json
{
  "ok": true,
  "previewData": {}
}
```

### 16.3 保存草稿

`POST /api/screens`

请求：

```json
{
  "name": "销售经营总览",
  "dataset_id": "dataset_sales",
  "spec": {},
  "queryBindings": {},
  "editorMeta": {}
}
```

### 16.4 更新草稿

`PUT /api/screens/{screen_id}`

请求：

```json
{
  "name": "销售经营总览",
  "spec": {},
  "queryBindings": {},
  "editorMeta": {}
}
```

### 16.5 获取详情

`GET /api/screens/{screen_id}`

### 16.6 获取列表

`GET /api/screens`

### 16.7 发布

`POST /api/screens/{screen_id}/publish`

## 17. 存储设计

新增 `screens` 表：

```sql
CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  spec JSONB NOT NULL,
  query_bindings JSONB NOT NULL DEFAULT '{}'::JSONB,
  editor_meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

状态：

- `draft`
- `published`

首期不引入版本表。后续如需历史版本，可新增 `screen_versions`。

## 18. 前端需求

### 18.1 页面

新增：

- `/workbench/screens`
- `/workbench/screens/new`
- `/workbench/screens/[id]`

### 18.2 组件

新增：

- `screen-generate-form.tsx`
- `screen-preview.tsx`
- `screen-editor-shell.tsx`
- `screen-canvas.tsx`
- `screen-node-tree.tsx`
- `screen-properties-panel.tsx`
- `binding-editor.tsx`

### 18.3 编辑能力

首期支持：

- 修改标题。
- 修改组件类型。
- 修改 measure 绑定。
- 修改 dimension 绑定。
- 修改 time 绑定。
- 修改 aggregation。
- 修改 granularity。
- 修改 limit。
- 调整位置和尺寸。
- 删除组件。
- 保存草稿。
- 重新加载草稿。

首期不支持：

- 修改 dataset relationships。
- 新建复杂计算字段。
- 自定义 SQL。
- 多 dataset 混合绑定。

## 19. 后端目录建议

```text
apps/api/app/
  routers/
    screens.py
  services/
    datasets/
      types.py
      profile.py
      field_compiler.py
      query_planner.py
      query_executor.py
    screens/
      types.py
      catalog.py
      templates.py
      compiler.py
      validators.py
      graph.py
      graph_nodes.py
      repository.py
```

## 20. 前端目录建议

```text
apps/web/src/
  app/
    workbench/
      screens/
        page.tsx
        new/
          page.tsx
        [id]/
          page.tsx
  components/
    screens/
      screen-generate-form.tsx
      screen-preview.tsx
      screen-editor-shell.tsx
      screen-canvas.tsx
      screen-node-tree.tsx
      screen-properties-panel.tsx
      binding-editor.tsx
  lib/
    screens/
      api.ts
      types.ts
      catalog.tsx
      preview-data.ts
```

## 21. 非功能要求

1. 生成结果应可校验。
2. 生成失败必须有明确错误或 warning。
3. 所有查询必须受 dataset 约束。
4. 页面渲染必须统一使用 `json-render`。
5. 查询执行和页面渲染职责分离。
6. 低代码编辑不影响 dataset 模型。
7. Query Planner 不允许任意 SQL 注入。
8. calculated field 只允许白名单表达式。

## 22. 验收标准

### M1：DatasetProfile 与查询层

- 可以从现有 dataset 构造 DatasetProfile。
- 可以基于 QueryBindings 查询真实数据。
- 支持 metric、trend、breakdown、table 四类查询。

### M2：AI 生成并预览

- 输入 dataset 和 prompt。
- 后端返回 `spec + queryBindings + previewData`。
- 前端可以立即用 `json-render` 渲染预览。

### M3：草稿保存

- 生成结果可以保存为 screen draft。
- 列表页可展示草稿。
- 详情页可恢复 spec 和 preview。

### M4：低代码编辑

- 可以修改标题、组件类型、字段绑定和布局。
- 修改绑定后可以刷新组件数据。
- 编辑结果可以保存。

### M5：发布

- screen 可以发布。
- 发布态仍使用同一份 `json-render spec` 渲染。
- draft 和 published 状态可区分。

## 23. 实施优先级

推荐顺序：

1. DatasetProfile builder。
2. Query Planner / Executor。
3. ScreenPlan schema。
4. Spec Compiler。
5. Generate Preview API。
6. 前端 `json-render` 预览页。
7. screens 持久化。
8. 低代码编辑器。
9. 发布流程。

## 24. 风险

1. 字段语义配置不准确，导致组件选择不合理。
2. 多表 relationships 配置错误，导致真实查询结果异常。
3. calculated field 编译能力不足。
4. 图表选择和真实数据分布不匹配。
5. 低代码编辑器范围过大，导致主链路延迟。
6. `json-render` catalog 过宽，导致模型输出不稳定。

## 25. MVP 边界

MVP 固定支持：

- 单 dataset。
- PostgreSQL 数据源优先。
- 3 套模板。
- 5 类业务组件。
- 统一 `json-render` 渲染。
- 生成即预览。
- 基础低代码编辑。
- 草稿和发布。

MVP 不做：

- 跨 dataset。
- 自定义 SQL。
- 高级联动。
- 自定义组件市场。
- 多人协作。

## 26. 结论

本系统的目标是建设一个基于 dataset 真数据生成并编辑 `json-render spec` 的智能数据大屏系统。

最终职责边界：

- dataset 是数据真相。
- Query Planner 是数据执行层。
- LangGraph 生成 ScreenPlan。
- Spec Compiler 生成 `json-render spec`。
- `json-render` 贯穿生成预览、低代码编辑和最终发布。
- 低代码编辑器直接编辑 spec 和 bindings。
