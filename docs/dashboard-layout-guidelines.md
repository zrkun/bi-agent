# 数据大屏布局规范

本文档定义智能小Q生成数据大屏时的通用布局规则。规范不绑定任何业务领域，不假设数据集来自销售、财务、用户、设备、库存或工单。布局决策只能基于用户意图、`panel.type`、`queryType`、字段语义类型和 panel 顺序。

## 目标

1. 让大模型输出的 `panels` 具备清晰的信息层级。
2. 让后端生成的 `json-render spec` 有稳定、可解释的布局策略。
3. 避免页面错位、孤立组件、固定模板化和内容裁切。

## 输入要素

布局只能使用以下信息：

- `intent`：`overview`、`trend_analysis`、`dimension_breakdown`、`detail_table`。
- `panel.type`：`MetricCard`、`ProgressCard`、`AreaChart`、`LineChart`、`MultiLineChart`、`BarChart`、`MultiBarChart`、`RankList`、`PieChart`、`DonutChart`、`RadarChart`、`RadialChart`、`DataTable`。
- `panel.xField`：维度字段或时间字段。
- `panel.yField`：单个度量字段。
- `panel.yFields`：多个度量字段，用于多系列图表。
- 字段语义类型：`measure`、`dimension`、`time`。
- `panel` 顺序。

布局规范不得引用具体业务词，例如某个行业指标、对象名称或主题名称。

## 信息层级

`panels` 顺序必须表达布局优先级：

```text
主洞察 panel -> 关键摘要 panels -> 辅助分析 panels -> 明细 panel
```

- 主洞察 panel：回答用户问题的核心图表，通常是主趋势、主拆解或主明细。
- 关键摘要 panels：与主洞察相关的 1-4 个指标卡。
- 辅助分析 panels：解释主洞察的拆解、排行、占比或次级趋势。
- 明细 panel：用于核对数据的表格，通常放在最后；明细分析场景除外。

## Intent 布局模式

### overview

适用：用户要求整体看板、总览、概览、综合分析。

推荐结构：

```text
Header
KPI row: 2-4 个关键摘要
Main row: 主趋势图或主拆解图 + 重要辅助图
Support row: 排行 / 占比 / 次级拆解
Detail row: 可选 DataTable
```

规则：

- 允许 KPI 放在顶部，但不能只有 KPI 和无主次图表。
- 至少包含一个用于解释变化或结构的图表。
- 图表应形成主次关系，不要所有图表等权重。

### trend_analysis

适用：用户关注时间变化、走势、增长、下降、波动、同比、环比、最近 N 个周期。

推荐结构：

```text
Header
Hero: 通栏或大宽度趋势主图
KPI row: 1-3 个趋势相关摘要
Support grid: 辅助趋势 / 拆解贡献 / TopN
Detail row: 可选 DataTable
```

规则：

- 第一个 panel 必须是 `AreaChart` 或 `LineChart`。
- 主趋势图必须最大，优先通栏。
- KPI 必须单独成行，不和普通图表混排。
- 辅助图表用于解释趋势来源、周期差异或关键对象贡献。

### dimension_breakdown

适用：用户关注按某个维度拆解、占比、贡献、排名、结构对比。

推荐结构：

```text
Header
KPI row: 可选关键摘要
Main split: 主拆解图 + 辅助拆解图
Support row: 次级拆解 / TopN / 占比图
Detail row: 可选 DataTable
```

规则：

- 第一个分析图应该是核心维度拆解图。
- 主拆解图尺寸必须大于辅助拆解图。
- `BarChart` 和 `RankList` 优先用于高可读性的排序对比。
- `PieChart` / `DonutChart` 只用于少量分类占比，不用于高基数字段。

### detail_table

适用：用户要求明细、清单、列表、记录、核对数据。

推荐结构：

```text
Header
DataTable: 通栏明细表
KPI row or support grid: 辅助摘要和解释图表
```

规则：

- 必须包含 `DataTable`。
- `DataTable` 必须靠前，不要掉到页面最后。
- 表格应通栏或接近通栏。

## 组件尺寸

基准画布宽度为 1920，默认最小高度为 1080，可按内容自动撑开。

推荐尺寸：

- Header：高度 72。
- `MetricCard` / `ProgressCard`：高度 124-148。
- 主趋势图：高度 360-460。
- 主拆解图：高度 360-480。
- 普通图表：高度 280-360。
- 多系列图表（`MultiLineChart`、`MultiBarChart`）：适合半栏、三分之二栏或通栏，至少需要两个度量字段。
- 紧凑型图表（`PieChart`、`DonutChart`、`RadarChart`、`RadialChart`）：作为辅助组件使用，推荐宽度约为内容区 30%。凡是布局策略要求单行展示、通栏展示或主图展示的位置，禁止使用紧凑型图表。紧凑型图表只能和其他组件配对出现在同一行，不能单独成行。
- `RankList`：高度 280-360。
- `DataTable`：高度 360-460。
- 页面左右边距：32。
- 组件间距：24。

最小尺寸：

- KPI 宽度不小于 360，高度不小于 112。
- 普通图表宽度不小于 420，高度不小于 260。
- 表格宽度不小于 900，高度不小于 320。

## 布局校验

生成布局后必须满足：

1. 根画布高度大于等于所有组件的最大 `y + h + margin`。
2. 同一行组件高度一致或视觉上属于同一组。
3. 不允许单个组件孤立掉到新的一行且右侧大面积空白。
4. 不允许 KPI 和普通图表混在同一行网格。
5. 不允许主图尺寸小于辅助图。
6. 不允许连续多个相似占比图。
7. 需要单行展示、通栏展示或主图展示的图表，禁止使用 `PieChart`、`DonutChart`、`RadarChart`、`RadialChart`。
8. 紧凑型图表必须和其他组件配对出现在同一行，不能单独成行。
9. 不允许所有组件平均分配大小而没有主次。
10. 不允许为了稳定复用同一组 panel 结构。

## LLM 输出要求

大模型只输出：

```text
intent / filters / timeRange / panels
```

大模型不输出坐标，不输出 `json-render spec`。

`panels` 需要表达布局优先级：

- 趋势分析：主趋势图必须在第一位。
- 维度拆解：主拆解图必须早于辅助拆解图。
- 明细分析：`DataTable` 必须靠前。
- 总览分析：KPI 可以在前，但后面必须有解释性图表。
