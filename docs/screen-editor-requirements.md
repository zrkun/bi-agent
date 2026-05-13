# 数据大屏配置页需求文档

## 1. 背景

智能体生成的大屏结果已经收敛为一份 `spec`：

- `meta`：大屏元信息，例如标题、主题、模板、数据集 ID。
- `elements`：页面组件树，包含组件类型、布局、标题、绑定 key。
- `dataBindings`：组件数据绑定配置，描述每个组件如何基于数据集查询数据。

大屏配置页需要基于这份配置完成编辑、预览、保存、发布。整体交互参考 Quick BI 的大屏编辑器，但按当前 MVP 保持简化：左侧组件库，中间画布，右侧配置面板。

## 2. 目标

1. 支持打开智能体生成的大屏配置，并在画布中完整回显。
2. 支持基于 `spec.elements` 渲染页面结构。
3. 支持基于 `spec.dataBindings` 实时查询预览数据。
4. 支持编辑大屏状态：草稿、发布。
5. 支持从左侧组件库拖拽组件到画布。
6. 支持画布内拖拽移动、缩放组件，并实时更新 `spec`。
7. 支持组件配置、数据绑定配置的后续扩展。

## 2.1 技术栈和组件选型

大屏编辑器优先使用成熟组件完成基础交互，不手写复杂拖拽、缩放、标尺逻辑。

| 能力 | 选型 | 使用位置 | 说明 |
| --- | --- | --- | --- |
| 自由画布拖拽、缩放、辅助线 | `react-moveable` | 中间画布 | 负责组件移动、缩放、吸附、参考线、边界约束 |
| 标尺 | `@scena/react-ruler` | 中间画布顶部和左侧 | 负责 X/Y 标尺、负向冗余刻度、滚动联动 |
| 左侧拖入画布 | `@dnd-kit/core` | 左侧组件库到画布 | 负责跨区域拖拽，替换原生 DnD，统一拖拽状态和占位反馈 |
| 图表渲染 | `recharts` + `shadcn/ui chart` | 大屏组件库 | 负责折线、面积、柱状、饼图、雷达、径向等图表 |
| 基础 UI | `shadcn/ui` | 页面框架和配置面板 | Button、Input、Select、Tabs、Tooltip、Dialog、ScrollArea 等 |
| 表格 | `shadcn/ui Table` | `DataTable` 组件 | 负责明细数据展示和横向滚动容器 |
| spec 校验 | `zod` | 保存前、接口入参、AI 生成结果落库前 | 约束 `spec.elements`、`dataBindings`、组件 props |
| 编辑器状态 | `zustand` | 编辑器工作台 | 管理选中组件、历史栈、缩放、滚动、未保存状态 |

MVP 允许先保留局部 `useState`，但组件边界需要按上表拆分，避免页面文件继续膨胀。

## 2.2 编辑器模块拆分

配置页需要拆成以下组件，页面只负责取数和组装：

| 组件 | 职责 |
| --- | --- |
| `ScreenEditorWorkbench` | 页面工作台容器，负责加载大屏、保存、发布 |
| `EditorTopBar` | 顶部返回、名称、撤销、重做、预览、保存、发布 |
| `EditorToolbar` | 缩放、吸附开关、对齐工具、层级工具 |
| `ComponentLibrary` | 左侧组件库，两栏展示组件预览、名称、说明 |
| `CanvasViewport` | 中间可滚动画布视口，承载网格、标尺、画布定位 |
| `CanvasRuler` | 封装 `@scena/react-ruler`，处理 `-100` 冗余、缩放、滚动联动 |
| `ScreenCanvas` | 按 `spec.elements` 渲染大屏内容 |
| `CanvasMoveableLayer` | 封装 `react-moveable`，处理选中组件移动、缩放、吸附 |
| `PropertyPanel` | 右侧配置面板容器 |
| `GlobalConfigPanel` | 大屏全局配置 |
| `ComponentConfigPanel` | 组件基础配置、样式配置 |
| `DataBindingPanel` | 组件字段绑定、聚合、排序、limit 配置 |
| `ScreenComponentRenderer` | 根据组件类型从 catalog 获取真实渲染组件 |

## 3. 非目标

当前 MVP 不做以下能力：

- 多页面管理。
- 图层面板。
- 模板推荐区。
- 离线缓存预览数据。
- 组件动画配置。
- 跨组件联动。

## 4. 数据结构

### 4.1 数据库保存结构

数据库只保存大屏作品配置，不保存运行结果：

```text
screens
- id
- dataset_id
- name
- prompt
- status
- spec
- owner
- created_at
- updated_at
```

`status` 取值：

```text
draft
published
```

### 4.2 spec 结构

```json
{
  "version": "1.0",
  "root": "screen-root",
  "meta": {
    "datasetId": "dataset_xxx",
    "title": "综合看板",
    "template": "executive_overview",
    "theme": "light"
  },
  "elements": {},
  "dataBindings": {}
}
```

### 4.3 elements

`elements` 用于描述页面组件：

```json
{
  "sales-trend": {
    "type": "AreaChart",
    "props": {
      "title": "月度销售额趋势",
      "layout": { "x": 32, "y": 272, "w": 916, "h": 348 },
      "bindingKey": "sales-trend-binding"
    },
    "children": []
  }
}
```

字段说明：

- `type`：组件类型，必须来自内置组件库。
- `props.title`：组件标题。
- `props.layout`：画布坐标和尺寸。
- `props.bindingKey`：关联 `dataBindings` 中的查询配置。
- `children`：子节点 ID 列表。

### 4.4 dataBindings

`dataBindings` 用于描述组件如何查数：

```json
{
  "sales-trend-binding": {
    "widgetId": "sales-trend",
    "datasetId": "dataset_xxx",
    "queryType": "trend",
    "fields": {
      "time": "df_date",
      "measure": "df_sales_amount"
    },
    "aggregation": "sum",
    "granularity": "month",
    "limit": 12,
    "display": {
      "format": null,
      "showComparison": false
    }
  }
}
```

`dataBindings` 是配置，不是结果。打开编辑页或刷新预览时，后端根据它实时查询数据，返回临时 `preview_data` 给前端渲染。

## 5. 页面布局

页面采用三栏结构：

```text
顶部操作栏
缩放工具条
左侧组件库 | 中间画布 | 右侧配置
```

### 5.1 顶部操作栏

包含：

- 返回。
- 大屏名称。
- 收藏图标。
- 撤销。
- 重做。
- 替换数据集。
- 全局参数。
- 全局配置。
- 预览。
- 保存草稿。
- 保存并发布。

行为：

- 点击保存草稿：调用状态接口，将 `status` 更新为 `draft`。
- 点击保存并发布：调用状态接口，将 `status` 更新为 `published`。
- 保存状态成功后，页面展示成功提示。

### 5.2 缩放工具条

仅保留画布缩放能力：

- 当前缩放比例。
- 缩小。
- 滑块。
- 放大。

不展示组件分类菜单，例如图表、文本、形状、媒体、交互、素材。

实现要求：

- 缩放状态由编辑器 store 管理。
- 缩放只影响画布内容，不改变画布在视口中的物理起点。
- 标尺和 Moveable 控制框都必须读取同一份缩放比例。
- 缩放范围默认 `25% ~ 200%`。

### 5.3 左侧组件库

左侧展示当前系统内置组件，必须和大屏渲染 catalog 保持一致。

展示形式：

- 两栏布局。
- 每个组件卡片上方展示组件预览。
- 每个组件卡片下方展示组件名称和说明。

当前内置组件：

| 组件类型 | 显示名称 | 用途 |
| --- | --- | --- |
| `SectionHeader` | 标题栏 | 展示大屏标题或区域标题 |
| `TextBlock` | 文本 | 展示静态说明、注释、单位说明 |
| `MetricCard` | 指标卡 | 展示核心经营指标 |
| `ProgressCard` | 进度卡 | 展示完成度或占比指标 |
| `LineChart` | 折线图 | 展示单指标趋势变化 |
| `MultiLineChart` | 多折线图 | 展示多指标趋势对比 |
| `AreaChart` | 面积图 | 展示趋势面积变化 |
| `BarChart` | 柱状图 | 展示分类对比排行 |
| `MultiBarChart` | 多柱状图 | 展示多指标分类对比 |
| `PieChart` | 饼图 | 展示占比结构 |
| `DonutChart` | 环形图 | 展示环形占比结构 |
| `RadarChart` | 雷达图 | 展示多维能力对比 |
| `RadialChart` | 径向图 | 展示径向进度排行 |
| `RankList` | 排行榜 | 展示 TopN 列表 |
| `DataTable` | 数据表格 | 展示结构化明细数据 |

组件分类：

- 基础组件：`SectionHeader`、`TextBlock`。
- 指标组件：`MetricCard`、`ProgressCard`。
- 趋势组件：`LineChart`、`MultiLineChart`、`AreaChart`。
- 对比组件：`BarChart`、`MultiBarChart`、`RankList`。
- 占比组件：`PieChart`、`DonutChart`、`RadialChart`。
- 多维组件：`RadarChart`。
- 明细组件：`DataTable`。

紧凑图表规则：

- `PieChart`、`DonutChart`、`RadarChart`、`RadialChart` 属于紧凑图表。
- 紧凑图表不能单独通栏展示。
- 紧凑图表不能单独成行。
- 紧凑图表需要和其他组件配对使用，推荐宽度约为画布内容宽度的 `30% ~ 40%`。
- 需要单行通栏展示时，优先使用 `LineChart`、`AreaChart`、`BarChart`、`MultiLineChart`、`MultiBarChart`、`DataTable`。

组件库 MVP 行为：

- 使用 `@dnd-kit/core` 支持拖拽组件卡片到画布。
- 拖拽时显示组件占位框，落点需要转换为画布坐标。
- 松手后在画布落点新增组件。
- 新增组件写入 `spec.elements`。
- 新增组件如需数据绑定，则同步创建默认 `spec.dataBindings` 配置。
- 如果组件暂时缺少绑定字段，则画布组件展示空数据状态。

### 5.4 中间画布

画布负责渲染 `spec.elements`：

- 使用 `screen-root` 作为根节点。
- 根节点尺寸读取 `screen-root.props.layout`。
- 默认 1920 × 1080。
- 根据缩放比例缩放画布。
- 画布背景展示点阵辅助定位。
- 画布顶部和左侧展示标尺。
- 画布左上角对齐标尺 `0,0`。
- X/Y 方向标尺需要保留 `-100px` 冗余区域。
- 视口滚动时，标尺刻度需要跟随 `scrollLeft` / `scrollTop` 联动。
- 标尺容器固定贴着工作区边缘，不能跟随画布盒子缩进。

画布组件实现：

| 画布能力 | 实现组件 |
| --- | --- |
| 工作区滚动和背景 | `CanvasViewport` |
| X/Y 标尺 | `CanvasRuler` + `@scena/react-ruler` |
| 大屏内容渲染 | `ScreenCanvas` |
| 组件移动和缩放 | `CanvasMoveableLayer` + `react-moveable` |
| 拖入占位 | `CanvasDropIndicator` + `@dnd-kit/core` |

渲染规则：

1. 读取 `spec.root`。
2. 根据 root 的 `children` 顺序渲染子组件。
3. 每个组件读取 `props.layout` 进行绝对定位。
4. 每个组件通过 `props.bindingKey` 读取临时 `preview_data`。
5. `preview_data` 不存在时展示空状态。

### 5.5 右侧配置面板

当前默认展示全局配置。

展示内容：

- 搜索框。
- 大屏尺寸。
- 缩放方式。
- 数据集名称。
- 组件数。
- 色系。
- 字体。
- 背景。
- 页面切换配置。

后续扩展：

- 点击画布组件后，右侧切换为组件配置。
- 点击空白画布时，右侧切换为全局配置。

MVP 中右侧面板需要拆成三个明确区域：

| 面板 | 触发条件 | 内容 |
| --- | --- | --- |
| `GlobalConfigPanel` | 未选中组件 | 大屏尺寸、主题、背景、数据集、组件数量 |
| `ComponentConfigPanel` | 选中组件 | 标题、类型、坐标、尺寸、层级、基础样式 |
| `DataBindingPanel` | 选中带数据绑定组件 | 维度、时间、度量、多度量、聚合、粒度、排序、条数 |

字段选择使用统一 Select 组件，不能使用原生下拉。下拉层级需要高于右侧面板，不能被容器裁切。

## 6. 数据加载流程

### 6.1 从智能体进入编辑页

```text
智能体生成 spec
点击编辑
POST /api/screens 保存大屏
跳转 /workbench/screens/new?id={id}
```

保存时只提交：

```json
{
  "dataset_id": "dataset_xxx",
  "name": "综合看板",
  "prompt": "用户原始问题",
  "spec": {}
}
```

### 6.2 打开编辑页

```text
GET /api/screens/{id}
后端读取 screens.spec
后端读取 spec.dataBindings
后端实时查询数据集
后端返回 screen + preview_data
前端渲染画布
```

返回示例：

```json
{
  "ok": true,
  "screen": {
    "id": "screen_xxx",
    "dataset_id": "dataset_xxx",
    "name": "综合看板",
    "status": "draft",
    "spec": {},
    "preview_data": {}
  }
}
```

注意：`preview_data` 只作为接口响应中的运行时数据，不落库。

## 7. 组件与数据绑定关系

组件通过 `bindingKey` 找到数据绑定：

```text
elements.sales-trend.props.bindingKey
-> dataBindings.sales-trend-binding
-> 实时查询数据
-> preview_data.sales-trend-binding
-> 组件渲染
```

示例：

```json
{
  "type": "AreaChart",
  "props": {
    "bindingKey": "sales-trend-binding"
  }
}
```

对应：

```json
{
  "sales-trend-binding": {
    "queryType": "trend",
    "fields": {
      "time": "df_f29ff327021342c8acac1dde4e8359c0",
      "measure": "df_50de51fa93344b74a8c3ef63a5e001da"
    },
    "aggregation": "sum",
    "granularity": "month"
  }
}
```

## 7.1 组件查询类型映射

不同组件允许的数据绑定形态不同，右侧配置面板和 AI 生成结果都必须遵守该映射：

| 组件类型 | queryType | 必填字段 | 可选字段 |
| --- | --- | --- | --- |
| `MetricCard` | `metric` | `measure` | `filters`、`aggregation`、`format`、`showComparison` |
| `ProgressCard` | `metric` | `measure` | `targetMeasure`、`filters`、`aggregation`、`format` |
| `LineChart` | `trend` | `time`、`measure` | `granularity`、`filters`、`limit` |
| `MultiLineChart` | `trend` | `time`、`measures` | `granularity`、`filters`、`limit` |
| `AreaChart` | `trend` | `time`、`measure` | `granularity`、`filters`、`limit` |
| `BarChart` | `breakdown` | `dimension`、`measure` | `sort`、`limit`、`filters` |
| `MultiBarChart` | `breakdown` | `dimension`、`measures` | `sort`、`limit`、`filters` |
| `PieChart` | `breakdown` | `dimension`、`measure` | `limit`、`filters` |
| `DonutChart` | `breakdown` | `dimension`、`measure` | `limit`、`filters` |
| `RadarChart` | `breakdown` | `dimension`、`measure` 或 `measures` | `limit`、`filters` |
| `RadialChart` | `breakdown` | `dimension`、`measure` | `limit`、`filters` |
| `RankList` | `breakdown` | `dimension`、`measure` | `sort`、`limit`、`filters` |
| `DataTable` | `table` | `columns` | `sort`、`limit`、`filters` |
| `SectionHeader` | 无 | 无 | 无 |
| `TextBlock` | 无 | 无 | 无 |

无数据绑定组件不能创建 `dataBindings`。

## 7.2 布局生成规范

智能体生成大屏 JSON 时，需要按照统一布局规范生成 `props.layout`，不能只套固定 4 个槽位。

通用规则：

- 设计稿基准尺寸为 `1920 × 1080`。
- 页面边距默认 `32px`。
- 组件间距默认 `24px`。
- 标题栏高度默认 `72px`。
- 指标卡高度默认 `112px ~ 148px`。
- 主图表高度默认 `320px ~ 420px`。
- 明细表高度默认 `300px ~ 420px`。
- 所有布局值必须是整数。
- 所有组件不能相互重叠。
- 所有组件必须在 `screen-root.props.layout` 范围内。

布局优先级：

1. 标题栏优先放顶部。
2. 指标卡优先组成一行，数量为 `2 ~ 4` 个。
3. 趋势分析类问题，趋势图优先使用大面积主区域。
4. 对比排行类问题，柱状图、排行榜优先使用中等宽度区域。
5. 明细数据表格优先放底部。
6. 紧凑图表只能作为辅助区域，不能单独通栏。
7. 多指标对比优先使用 `MultiLineChart` 或 `MultiBarChart`。

布局模式：

| 场景 | 推荐布局 |
| --- | --- |
| 总览分析 | 顶部标题 + 指标卡行 + 中部主趋势/主对比 + 右侧或下方辅助图 + 底部表格 |
| 趋势分析 | 顶部标题 + 指标卡行 + 大趋势图 + 分类/区域对比 + 明细表 |
| 排行分析 | 顶部标题 + 指标卡行 + 主排行图 + 辅助占比图 + 明细表 |
| 多指标对比 | 顶部标题 + 指标卡行 + 多折线/多柱状主图 + 维度拆解图 |
| 结构占比 | 顶部标题 + 指标卡行 + 主对比图 + 多个紧凑占比图配对展示 |

AI 生成结果落库前，需要用代码做一次布局校验和修正：

- 自动修正负数 `x/y`。
- 自动修正超出画布的 `w/h`。
- 自动检测重叠。
- 自动检测紧凑图表是否单独成行。
- 修正失败时返回警告，不直接保存错误布局。

## 8. 编辑能力规划

### 8.1 拖拽编排交互

拖拽编排是 MVP 核心能力，不放到后续阶段。

拖拽编排统一由以下组件完成：

| 交互 | 组件/库 | 说明 |
| --- | --- | --- |
| 左侧拖入画布 | `@dnd-kit/core` | 管理拖拽源、拖拽中预览、画布 drop 命中 |
| 画布内移动 | `react-moveable` | 更新组件 `props.layout.x/y` |
| 画布内缩放 | `react-moveable` | 更新组件 `props.layout.w/h` |
| 吸附和参考线 | `react-moveable` | 使用 element guidelines、grid guidelines、bounds |
| 标尺 | `@scena/react-ruler` | 与画布滚动和缩放保持一致 |

从组件库拖入画布：

```text
按住左侧组件卡片
拖动到中间画布
画布显示落点占位框
松手
创建组件节点
写入 spec.elements
必要时写入 spec.dataBindings
选中新组件
右侧切换为组件配置
```

落点计算：

- 鼠标位置需要转换为画布坐标。
- 画布坐标需要除以当前缩放比例。
- 新组件的 `x/y` 需要限制在画布范围内。
- 默认启用 8px 网格吸附。

新增组件默认尺寸：

| 组件类型 | 默认宽度 | 默认高度 |
| --- | ---: | ---: |
| `SectionHeader` | 720 | 72 |
| `TextBlock` | 360 | 120 |
| `MetricCard` | 360 | 128 |
| `ProgressCard` | 360 | 128 |
| `LineChart` | 640 | 320 |
| `MultiLineChart` | 720 | 340 |
| `AreaChart` | 640 | 320 |
| `BarChart` | 640 | 320 |
| `MultiBarChart` | 720 | 340 |
| `PieChart` | 360 | 320 |
| `DonutChart` | 360 | 320 |
| `RadarChart` | 360 | 320 |
| `RadialChart` | 360 | 320 |
| `RankList` | 360 | 320 |
| `DataTable` | 720 | 360 |

最小尺寸：

| 组件类型 | 最小宽度 | 最小高度 |
| --- | ---: | ---: |
| `SectionHeader` | 320 | 56 |
| `TextBlock` | 200 | 80 |
| `MetricCard` | 240 | 96 |
| `ProgressCard` | 240 | 96 |
| `LineChart` | 360 | 220 |
| `MultiLineChart` | 420 | 240 |
| `AreaChart` | 360 | 220 |
| `BarChart` | 360 | 220 |
| `MultiBarChart` | 420 | 240 |
| `PieChart` | 260 | 240 |
| `DonutChart` | 260 | 240 |
| `RadarChart` | 280 | 260 |
| `RadialChart` | 260 | 240 |
| `RankList` | 280 | 240 |
| `DataTable` | 480 | 260 |

新增节点示例：

```json
{
  "chart-001": {
    "type": "BarChart",
    "props": {
      "title": "未命名柱状图",
      "layout": { "x": 320, "y": 240, "w": 640, "h": 320 },
      "bindingKey": "chart-001-binding"
    },
    "children": []
  }
}
```

画布内移动：

- 点击组件后进入选中状态。
- 拖拽组件主体移动位置，由 `react-moveable` 处理。
- 移动过程中展示选中边框。
- 移动结束后更新 `props.layout.x` 和 `props.layout.y`。
- 组件不能拖出画布边界。
- 移动时右侧配置中的坐标同步变化。
- 移动时展示与画布边界、其他组件、网格的吸附参考线。

画布内缩放：

- 选中组件后由 `react-moveable` 展示缩放控制点。
- 拖拽控制点调整宽高，由 `react-moveable` 处理。
- 缩放结束后更新 `props.layout.w` 和 `props.layout.h`。
- 不同组件需要有最小尺寸限制。
- 缩放时支持 8px 网格吸附。

删除组件：

1. 从 `spec.elements` 删除组件节点。
2. 从父节点 `children` 中移除该组件 ID。
3. 如果组件存在 `bindingKey`，删除对应 `spec.dataBindings[bindingKey]`。
4. 清空当前选中组件。
5. 右侧切回全局配置。

选中状态：

- 画布组件显示选中边框。
- 右侧展示组件配置。
- 点击画布空白处取消选中组件。

空数据绑定策略：

- 拖入需要数据的组件时，先创建空绑定。
- 空绑定状态下组件显示空状态。
- 右侧数据配置提示选择维度和度量。
- 不触发无效查询。

吸附规则：

- 默认启用 8px 网格吸附。
- 组件移动和缩放时吸附到画布边界。
- 组件移动和缩放时吸附到其他组件的左、右、上、下、中线。
- 吸附线只在拖拽或缩放过程中展示。
- 画布缩放后吸附计算仍以设计稿坐标为准。

### 8.2 右侧组件配置 MVP

选中组件后，右侧从全局配置切换为组件配置。

基础配置：

- 组件标题。
- 组件类型，只读。
- 位置 `x/y`。
- 尺寸 `w/h`。
- 层级顺序。

样式配置：

- 背景色。
- 边框。
- 圆角。
- 标题字号。
- 标题颜色。
- 图表主色。
- 是否显示图例。
- 是否显示坐标轴。

数据绑定配置：

- 数据集，只读，继承大屏 `dataset_id`。
- 维度字段。
- 时间字段。
- 度量字段。
- 多度量字段。
- 聚合方式。
- 时间粒度。
- 排序。
- 数据条数。

配置修改规则：

- 基础配置和样式配置更新 `spec.elements[componentId].props`。
- 数据绑定配置更新 `spec.dataBindings[bindingKey]`。
- 数据绑定修改后重新请求预览数据。
- 修改后页面进入未保存状态。

### 8.3 MVP

1. 打开大屏。
2. 回显画布。
3. 实时查数渲染。
4. 展示内置组件库。
5. 展示全局配置。
6. 从左侧拖拽组件到画布。
7. 画布内移动组件。
8. 画布内缩放组件。
9. 选中组件。
10. 右侧展示组件基础配置。
11. 修改组件标题。
12. 修改组件位置和尺寸。
13. 删除组件。
14. 修改组件样式。
15. 修改数据绑定字段。
16. 调整组件层级。
17. 吸附线。
18. 对齐工具。
19. 复制组件。
20. 撤销/重做。
21. 保存草稿。
22. 保存并发布。
23. 标尺和画布滚动联动。

### 8.4 后续阶段

1. 组合组件。
2. 跨组件联动。
3. 组件动画配置。
4. 多页面管理。
5. 组件模板和业务组件市场。

## 9. API 设计

### 9.1 保存大屏

```http
POST /api/screens
```

请求：

```json
{
  "dataset_id": "dataset_xxx",
  "name": "综合看板",
  "prompt": "生成一个经营分析大屏",
  "spec": {}
}
```

响应：

```json
{
  "ok": true,
  "screen": {
    "id": "screen_xxx",
    "status": "draft",
    "spec": {},
    "preview_data": {}
  }
}
```

### 9.2 获取大屏

```http
GET /api/screens/{id}
```

响应包含实时查询生成的 `preview_data`。

### 9.3 更新大屏配置

```http
PATCH /api/screens/{id}
```

请求：

```json
{
  "name": "综合看板",
  "spec": {}
}
```

说明：

- 保存前前端需要执行 `zod` 校验。
- 后端需要再次执行结构校验。
- 更新成功后返回最新 `screen + preview_data`。

### 9.4 刷新预览数据

```http
POST /api/screens/{id}/preview
```

请求：

```json
{
  "spec": {}
}
```

说明：

- 用于右侧数据绑定修改后刷新当前画布预览。
- 只返回运行时 `preview_data`，不落库。
- 如果绑定字段不完整，只返回对应组件空数据状态，不报错中断整个页面。

### 9.5 更新状态

```http
PATCH /api/screens/{id}/status
```

请求：

```json
{
  "status": "published"
}
```

## 10. 校验规则

### 10.1 spec 校验

保存前需要用 `zod` 校验：

- `version` 必填。
- `root` 必填。
- `elements[root]` 必须存在。
- 每个组件 `type` 必须在内置组件列表内。
- 每个组件必须有 `props.layout`。
- 有 `bindingKey` 的组件，必须能在 `dataBindings` 找到对应配置。
- 无数据绑定组件不能存在 `bindingKey`。
- `props.layout.x/y/w/h` 必须是数字。
- `props.layout.w/h` 不能小于组件最小尺寸。
- `props.layout` 不能超出根画布范围。
- 除有意覆盖类组件外，普通组件不能重叠。
- 紧凑图表不能单独成行或通栏展示。

### 10.2 dataBindings 校验

- `widgetId` 必须能在 `elements` 中找到。
- `datasetId` 必须等于当前大屏 `dataset_id`。
- `queryType` 必须是 `metric`、`trend`、`breakdown`、`table` 之一。
- `trend` 必须有 `time` 和 `measure` 或 `measures`。
- `breakdown` 必须有 `dimension` 和 `measure` 或 `measures`。
- `metric` 必须有 `measure`。
- `MultiLineChart` 和 `MultiBarChart` 必须使用 `measures`。
- `DataTable` 必须使用 `fields.columns`。

### 10.3 运行时兜底

- 单个组件绑定错误时，只让该组件展示空状态。
- 整个 `spec` 结构错误时，编辑页展示错误页，不进入画布。
- 保存失败时保留本地编辑状态。
- 发布前必须通过完整校验。

## 11. 状态流转

```text
新建 -> draft
draft -> published
published -> draft
```

说明：

- 保存草稿：状态为 `draft`。
- 保存并发布：状态为 `published`。
- 已发布大屏再次编辑时，可以转回 `draft`。

## 12. 关键原则

1. `spec` 是大屏作品配置的唯一核心。
2. `dataBindings` 属于 `spec`，不单独作为数据库字段。
3. `preview_data` 是运行时查询结果，不保存到数据库。
4. 左侧组件库必须和内置渲染组件保持一致。
5. 右侧配置面板编辑的是 `spec`，不是临时状态。
6. 画布渲染结果必须完全由 `spec + preview_data` 决定。
7. 能用成熟组件实现的交互，不手写复杂底层逻辑。
8. 编辑器页面只负责组合组件，不承载全部交互实现。
9. AI 生成、编辑器修改、发布预览必须使用同一份 `spec` 协议。
10. 运行时预览数据始终实时查询，不落库。

## 13. 依赖清单

前端新增或确认依赖：

```bash
pnpm --filter web add react-moveable @dnd-kit/core zustand zod
pnpm --filter web add @scena/react-ruler
```

说明：

- `@scena/react-ruler` 已用于标尺。
- `react-moveable` 用于替换当前自研移动、缩放、控制点逻辑。
- `@dnd-kit/core` 用于替换原生拖拽。
- `zustand` 用于拆出编辑器状态。
- `zod` 用于前后端保存前结构校验。

如项目中已经存在某个依赖，不重复安装。

## 14. MVP 实施顺序

1. 拆分编辑器页面组件：`EditorTopBar`、`ComponentLibrary`、`CanvasViewport`、`PropertyPanel`。
2. 抽出编辑器 store，管理 `spec`、选中项、缩放、滚动、历史栈。
3. 用 `CanvasRuler` 封装标尺，完成 `-100` 冗余、`0,0` 对齐、滚动联动。
4. 引入 `@dnd-kit/core`，替换左侧组件拖入画布逻辑。
5. 引入 `react-moveable`，替换画布内移动和缩放逻辑。
6. 补齐 `DataBindingPanel`，支持不同组件的字段绑定映射。
7. 补齐 `zod` 校验，保存和发布前校验 `spec`。
8. 把 AI 生成大屏 JSON 的布局规范接入生成大屏协议阶段。
9. 对照内置组件 catalog，补齐 `SectionHeader`、`TextBlock`、多折线、多柱状、表格等渲染和配置能力。
