---
name: fluid-responsive
description: >
  流式响应与自适应布局规范。用于处理 clamp()、minmax()、auto-fit/auto-fill、
  aspect-ratio、容器宽度、阅读宽度、流式排版与“尽量少依赖断点”的页面实现。
  当任务涉及 响应式、自适应、clamp、流式布局、断点过多、不同视口下比例失衡、
  首屏在中等宽度拥挤、图片被压缩但节奏没变、Tailwind 任意值流式排版 时优先使用。
---

# Fluid Responsive

本 skill 用于在当前项目里处理“流式响应优先，断点兜底”的页面实现。

目标不是完全禁用断点，而是把断点只留给结构变化，把尺寸缩放尽量交给流式值。

## 何时使用

命中以下任一情况时优先使用：

- `响应式`
- `自适应`
- `clamp`
- `流式布局`
- `不要依赖断点`
- `断点强切`
- `中等宽度下页面拥挤`
- `图片只是被压缩`
- `标题/正文/间距想自然缩放`
- `Tailwind 能不能直接写 clamp()`

## 核心原则

1. 结构变化用断点。
2. 尺寸缩放用流式值。
3. 阅读宽度单独约束，不靠断点硬切。
4. 图片和媒体优先保证比例与容器关系，不只缩宽度。
5. 响应式先修节奏，再修某个单独元素。

一句话总结：

- 布局切换靠断点
- 文字、间距、容器 padding、模块间距靠 `clamp()`
- 网格列数优先 `minmax()` / `auto-fit`
- 媒体优先 `aspect-ratio + max-width + width: 100%`

## 在 Tailwind 中的默认做法

### 1. 字号、间距、容器边距

直接使用任意值：

```tsx
className="text-[clamp(3rem,8vw,4.75rem)]"
className="px-[clamp(1rem,4vw,3rem)]"
className="gap-[clamp(1.25rem,3vw,2.5rem)]"
className="py-[clamp(4rem,10vw,8rem)]"
```

### 2. 网格与卡片

优先：

```tsx
className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]"
```

只有当结构真的需要明确切换时，才加少量断点。

### 3. 标题与正文宽度

- 标题优先用 `max-w-[10ch]` 或相近字符宽度
- 正文优先用 `max-w-[42rem]` 这类阅读宽度

不要让文本无限横向延展，也不要只在断点处突然变窄。

### 4. 图片与媒体

优先组合：

```tsx
className="w-full max-w-[clamp(22rem,70vw,46rem)]"
className="aspect-[16/10]"
className="object-cover"
```

### 5. 断点使用边界

断点只应用在这些地方：

- 导航从横排改抽屉
- 双栏改单栏
- sidebar 出现或收起
- 模块顺序重排
- 某个交互模式本身需要切换

不推荐主要用断点处理这些问题：

- 标题字号
- section padding
- 模块 gap
- 卡片内边距
- 正文字号和行高

这些应优先流式。

## 默认工作流

1. 先判断问题是“结构问题”还是“尺寸问题”。
2. 若是尺寸问题，先尝试 `clamp()`、`minmax()`、`max-width`、`aspect-ratio`。
3. 若是结构问题，再加最少数量的断点。
4. 优先修整块 section 的节奏，不要只改某一张图或某一个标题。
5. 在中等宽度下重点检查：
   - 标题是否仍然可读
   - 文案是否过宽
   - 图片是否只是被压缩
   - 左右两栏是否已经应该改成上下布局

## 什么时候继续读取参考文档

遇到下面情况时，继续读：

- 需要更具体的布局判断
- 不确定何时该用断点、何时该用流式值
- 需要可直接复用的 Tailwind 模式

参考文档：

- `./references/fluid-layout-rules.md`
