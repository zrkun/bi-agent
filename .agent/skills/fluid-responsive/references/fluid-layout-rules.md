# Fluid Layout Rules

这份参考文档提供当前项目里处理流式响应时的具体判断规则。

## 一、先判断是哪一类问题

### 1. 结构问题

特征：

- 左右布局已经挤压到影响阅读
- 导航、侧栏、按钮组需要重新排布
- 某块内容顺序需要变化

处理：

- 用最少断点切结构

### 2. 尺寸问题

特征：

- 标题过大或过小
- 正文行长不舒服
- section 太矮或太挤
- 图片只是被压缩，但整块节奏没调整

处理：

- 优先 `clamp()`、`max-width`、`gap`、`padding`、`aspect-ratio`

## 二、推荐优先级

遇到 hero 或首屏问题时，按这个顺序修：

1. `min-height`
2. `padding-top / padding-bottom`
3. `grid gap`
4. `h1` 的 `font-size`
5. 正文的 `font-size / line-height / max-width`
6. 图片容器的 `max-width`
7. 最后才考虑切布局

不要一上来只改图片宽度。

## 三、Tailwind 常用模式

### Hero section

```tsx
className="min-h-[max(44rem,calc(100svh-4rem))]"
className="px-[clamp(1rem,4vw,3rem)]"
className="pt-[clamp(7rem,12vw,10rem)]"
className="pb-[clamp(4rem,8vw,7rem)]"
className="gap-[clamp(2rem,5vw,4rem)]"
```

### Heading

```tsx
className="max-w-[10ch] text-[clamp(3rem,8vw,5rem)] leading-[0.96] tracking-[-0.06em]"
```

### Paragraph

```tsx
className="max-w-[42rem] text-[clamp(1rem,1.2vw,1.125rem)] leading-[clamp(1.8rem,2.3vw,2.2rem)]"
```

### Adaptive grid

```tsx
className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]"
```

### Media container

```tsx
className="w-full max-w-[clamp(22rem,70vw,46rem)]"
className="aspect-[16/10]"
```

## 四、断点保留原则

断点不是禁用，而是减量。

推荐：

- 只保留真正必要的 1 到 3 个结构断点
- 一个 section 能靠流式值解决，就不要再叠多个 `md/lg/xl`

不推荐：

- `text-*` 主要靠 `sm/md/lg/xl` 连续跳
- `gap-*` 每个断点一套
- `pt/pb` 每个断点一套

## 五、评估标准

完成后至少检查这几点：

1. 小屏不会横向溢出
2. 中等宽度不会“只是图片变小”
3. 标题不会一行过长或被挤得过碎
4. 正文阅读宽度稳定
5. 卡片和图片区的层级关系还清楚
6. 断点数量是否真的比之前更少
