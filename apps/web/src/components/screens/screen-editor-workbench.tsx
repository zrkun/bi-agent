"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import ScenaRuler from "@scena/react-ruler";
import {
  ArrowLeft,
  BarChart3,
  BringToFront,
  ChevronDown,
  Copy,
  Redo2,
  Save,
  Search,
  Settings,
  Star,
  Trash2,
  Undo2,
  SendToBack,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ScreenPreview } from "@/components/screens/screen-preview";
import { getScreen, updateScreen, updateScreenStatus } from "@/lib/screens/api";
import type {
  DatasetRecord,
  JsonRenderSpec,
  PreviewData,
  ScreenRecord,
  WidgetResult,
} from "@/lib/screens/types";
import { cn } from "@/lib/utils";

type LayoutRect = { h: number; w: number; x: number; y: number };
type ScreenElement = JsonRenderSpec["elements"][string];
type DatasetFieldOption = {
  aggregation?: string | null;
  dataType: string;
  displayName: string;
  fieldId: string;
  semanticType: string;
};
const CANVAS_RULER_OVERFLOW = 100;
const DEFAULT_CANVAS_MARGIN = 32;
const DEFAULT_COMPONENT_GAP = 24;
const DEFAULT_LAYOUT_COLUMNS = 12;
const DEFAULT_GRID_SIZE = 8;
const RULER_SIZE = 24;
const AUXILIARY_COMPONENT_TYPES = new Set([
  "DonutChart",
  "MetricCard",
  "PieChart",
  "ProgressCard",
  "RadarChart",
  "RadialChart",
  "RankList",
]);
type EditorComponent = {
  description: string;
  name: string;
  preview: string;
  queryType: "breakdown" | "metric" | "none" | "table" | "trend";
  type: string;
};

const commonComponents: EditorComponent[] = [
  {
    description: "展示大屏标题或区域标题",
    name: "标题栏",
    preview: "header",
    queryType: "none",
    type: "SectionHeader",
  },
  {
    description: "展示说明、注释、单位",
    name: "文本",
    preview: "text",
    queryType: "none",
    type: "TextBlock",
  },
  {
    description: "展示核心经营指标",
    name: "指标卡",
    preview: "metric",
    queryType: "metric",
    type: "MetricCard",
  },
  {
    description: "展示完成度或占比指标",
    name: "进度卡",
    preview: "progress",
    queryType: "metric",
    type: "ProgressCard",
  },
  {
    description: "展示单指标趋势变化",
    name: "折线图",
    preview: "line",
    queryType: "trend",
    type: "LineChart",
  },
  {
    description: "展示多指标趋势对比",
    name: "多折线图",
    preview: "multiLine",
    queryType: "trend",
    type: "MultiLineChart",
  },
  {
    description: "展示趋势面积变化",
    name: "面积图",
    preview: "area",
    queryType: "trend",
    type: "AreaChart",
  },
  {
    description: "展示分类对比排行",
    name: "柱状图",
    preview: "bar",
    queryType: "breakdown",
    type: "BarChart",
  },
  {
    description: "展示多指标分类对比",
    name: "多柱状图",
    preview: "multiBar",
    queryType: "breakdown",
    type: "MultiBarChart",
  },
  {
    description: "展示占比结构",
    name: "饼图",
    preview: "pie",
    queryType: "breakdown",
    type: "PieChart",
  },
  {
    description: "展示环形占比结构",
    name: "环形图",
    preview: "donut",
    queryType: "breakdown",
    type: "DonutChart",
  },
  {
    description: "展示多维能力对比",
    name: "雷达图",
    preview: "radar",
    queryType: "breakdown",
    type: "RadarChart",
  },
  {
    description: "展示径向进度排行",
    name: "径向图",
    preview: "radial",
    queryType: "breakdown",
    type: "RadialChart",
  },
  {
    description: "展示 TopN 列表",
    name: "排行榜",
    preview: "rank",
    queryType: "breakdown",
    type: "RankList",
  },
  {
    description: "展示结构化明细数据",
    name: "数据表格",
    preview: "table",
    queryType: "table",
    type: "DataTable",
  },
];

export function ScreenEditorWorkbench({ datasets }: { datasets: DatasetRecord[] }) {
  const [screen, setScreen] = useState<ScreenRecord | null>(null);
  const [editableSpec, setEditableSpec] = useState<JsonRenderSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [redoStack, setRedoStack] = useState<JsonRenderSpec[]>([]);
  const [undoStack, setUndoStack] = useState<JsonRenderSpec[]>([]);
  const [zoom, setZoom] = useState(58);
  const [savingStatus, setSavingStatus] = useState<"draft" | "published" | null>(null);
  const [canvasScroll, setCanvasScroll] = useState({ left: 0, top: 0 });
  const [activeComponentType, setActiveComponentType] = useState<string | null>(null);
  const [localPreviewData, setLocalPreviewData] = useState<PreviewData>({});
  const [datasetFields, setDatasetFields] = useState<DatasetFieldOption[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const {
    isOver: isCanvasDropping,
    setNodeRef: setCanvasDropRef,
  } = useDroppable({ id: "screen-canvas" });

  useEffect(() => {
    let mounted = true;
    const id = new URLSearchParams(window.location.search).get("id");

    if (!id) {
      setEditableSpec(createBlankSpec());
      return undefined;
    }

    const screenId = id;

    async function loadScreen() {
      setLoading(true);

      try {
        const data = await getScreen(screenId);

        if (!mounted) {
          return;
        }

        if (!data.ok || !data.screen) {
          setMessage("大屏不存在，请重新从智能体预览进入编辑。");
          return;
        }

        setScreen(data.screen);
        setEditableSpec(data.screen.spec);
        setLocalPreviewData(data.screen.preview_data ?? {});
        setRedoStack([]);
        setUndoStack([]);
      } catch {
        if (mounted) {
          setMessage("大屏加载失败，请稍后重试。");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadScreen();

    return () => {
      mounted = false;
    };
  }, [datasets]);

  const spec = editableSpec ?? (screen?.spec as JsonRenderSpec | undefined);
  const previewData = localPreviewData;
  const rootLayout = getElementLayout(spec?.elements[spec.root]);
  const canvasWidth = rootLayout?.w ?? 1920;
  const canvasHeight = rootLayout?.h ?? 1080;
  const contentHeight = Math.max(canvasHeight, getSpecContentHeight(spec, canvasHeight));
  const placementHeight = Math.max(contentHeight + canvasHeight, canvasHeight * 2);
  const previewSpec = spec ? withRootHeight(spec, contentHeight) : null;
  const selectedElement =
    selectedElementId && spec?.elements[selectedElementId]
      ? spec.elements[selectedElementId]
      : null;
  const selectedLayout = getElementLayout(selectedElement);
  const selectedBindingKey =
    typeof selectedElement?.props.bindingKey === "string"
      ? selectedElement.props.bindingKey
      : null;
  const selectedBinding =
    selectedBindingKey && typeof spec?.dataBindings?.[selectedBindingKey] === "object"
      ? spec.dataBindings[selectedBindingKey]
      : null;
  const selectedBindingDatasetId =
    selectedBinding && "datasetId" in selectedBinding
      ? String(selectedBinding.datasetId ?? "")
      : "";
  const globalDatasetId = String(spec?.meta?.datasetId ?? "");
  const activeDatasetId = selectedBindingDatasetId || globalDatasetId;
  const datasetName =
    datasets.find((dataset) => dataset.id === activeDatasetId)?.name ??
    activeDatasetId ??
    "未选择数据集";
  const isPublished = screen?.status === "published";
  const theme = String(spec?.meta?.theme ?? spec?.elements[spec.root]?.props.theme ?? "light");
  const scaleMode = String(spec?.elements[spec.root]?.props.scaleMode ?? "auto");
  const rootProps = spec?.elements[spec.root]?.props;
  const canvasMargin = getRootNumber(rootProps?.canvasMargin, DEFAULT_CANVAS_MARGIN);
  const componentGap = getRootNumber(rootProps?.componentGap, DEFAULT_COMPONENT_GAP);
  const gridSize = DEFAULT_GRID_SIZE;

  useEffect(() => {
    let mounted = true;

    if (!activeDatasetId) {
      setDatasetFields([]);
      return undefined;
    }

    async function loadDatasetFields() {
      try {
        const response = await fetch(`/api/datasets/${encodeURIComponent(activeDatasetId)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { item?: { fields?: unknown[] } | null };

        if (!mounted) {
          return;
        }

        setDatasetFields(normalizeDatasetFields(data.item?.fields ?? []));
      } catch {
        if (mounted) {
          setDatasetFields([]);
        }
      }
    }

    void loadDatasetFields();

    return () => {
      mounted = false;
    };
  }, [activeDatasetId]);

  function commitSpec(updater: (current: JsonRenderSpec) => JsonRenderSpec | null) {
    setEditableSpec((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);

      if (!next || next === current) {
        return current;
      }

      setUndoStack((stack) => [...stack.slice(-29), current]);
      setRedoStack([]);
      return next;
    });
  }

  function undo() {
    setUndoStack((stack) => {
      const previous = stack.at(-1);

      if (!previous || !editableSpec) {
        return stack;
      }

      setRedoStack((redoItems) => [...redoItems.slice(-29), editableSpec]);
      setEditableSpec(previous);

      return stack.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((stack) => {
      const next = stack.at(-1);

      if (!next || !editableSpec) {
        return stack;
      }

      setUndoStack((undoStackValue) => [...undoStackValue.slice(-29), editableSpec]);
      setEditableSpec(next);

      return stack.slice(0, -1);
    });
  }

  async function saveStatus(status: "draft" | "published") {
    if (!screen?.id || !spec || savingStatus) {
      return;
    }

    setSavingStatus(status);
    setMessage("");

    try {
      const updated = await updateScreen({
        id: screen.id,
        name: screen.name,
        spec,
      });

      if (!updated.ok || !updated.screen) {
        setMessage("配置保存失败，请稍后重试。");
        return;
      }

      const data = await updateScreenStatus(screen.id, status);

      if (!data.ok || !data.screen) {
        setMessage("状态保存失败，请稍后重试。");
        return;
      }

      setScreen(data.screen);
      setEditableSpec(data.screen.spec);
      setMessage(status === "published" ? "已保存并发布。" : "已保存。");
    } catch {
      setMessage("状态保存失败，请稍后重试。");
    } finally {
      setSavingStatus(null);
    }
  }

  function updateElementLayout(elementId: string, nextLayout: LayoutRect) {
    commitSpec((current) => {
      if (!current?.elements[elementId]) {
        return null;
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [elementId]: {
            ...current.elements[elementId],
            props: {
              ...current.elements[elementId].props,
              layout: nextLayout,
            },
          },
        },
      };
    });
  }

  function updateElementLayoutAndReflow(elementId: string, nextLayout: LayoutRect) {
    commitSpec((current) => {
      if (!current?.elements[elementId]) {
        return null;
      }

      const nextElements = {
        ...current.elements,
        [elementId]: {
          ...current.elements[elementId],
          props: {
            ...current.elements[elementId].props,
            layout: nextLayout,
          },
        },
      };

      return {
        ...current,
        elements: reflowRows(
          {
            ...current,
            elements: nextElements,
          },
          {
            canvasMargin,
            componentGap,
          },
        ),
      };
    });
  }

  function updateCanvasSize(value: string) {
    const [width, height] = value.split("x").map((item) => Number(item));

    if (!width || !height) {
      return;
    }

    commitSpec((current) => {
      const root = current.elements[current.root];
      const currentRootLayout = getElementLayout(root);

      if (!root || !currentRootLayout) {
        return null;
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [current.root]: {
            ...root,
            props: {
              ...root.props,
              layout: {
                ...currentRootLayout,
                h: height,
                w: width,
              },
            },
          },
        },
      };
    });
  }

  function updateRootProp(key: string, value: unknown) {
    commitSpec((current) => {
      const root = current.elements[current.root];

      if (!root) {
        return null;
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [current.root]: {
            ...root,
            props: {
              ...root.props,
              [key]: value,
            },
          },
        },
      };
    });
  }

  function updateRootNumberProp(key: string, value: number) {
    const nextValue = Math.max(0, Math.round(value));

    if (key !== "canvasMargin" && key !== "componentGap") {
      updateRootProp(key, nextValue);
      return;
    }

    commitSpec((current) => {
      const root = current.elements[current.root];

      if (!root) {
        return null;
      }

      const previousMargin = getRootNumber(root.props.canvasMargin, DEFAULT_CANVAS_MARGIN);
      const previousGap = getRootNumber(root.props.componentGap, DEFAULT_COMPONENT_GAP);
      const nextMargin = key === "canvasMargin" ? nextValue : previousMargin;
      const nextGap = key === "componentGap" ? nextValue : previousGap;

      return {
        ...current,
        elements: {
          ...reflowElementsForLayoutConfig(current, {
            canvasHeight: placementHeight,
            canvasWidth,
            nextGap,
            nextMargin,
            previousGap,
            previousMargin,
          }),
          [current.root]: {
            ...root,
            props: {
              ...root.props,
              [key]: nextValue,
            },
          },
        },
      };
    });
  }

  function updateElementTitle(title: string) {
    if (!selectedElementId) {
      return;
    }

    commitSpec((current) => {
      if (!current?.elements[selectedElementId]) {
        return null;
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [selectedElementId]: {
            ...current.elements[selectedElementId],
            props: {
              ...current.elements[selectedElementId].props,
              title,
            },
          },
        },
      };
    });
  }

  function updateElementProp(key: string, value: unknown) {
    if (!selectedElementId) {
      return;
    }

    commitSpec((current) => {
      if (!current?.elements[selectedElementId]) {
        return null;
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [selectedElementId]: {
            ...current.elements[selectedElementId],
            props: {
              ...current.elements[selectedElementId].props,
              [key]: value,
            },
          },
        },
      };
    });
  }

  function updateTheme(value: string) {
    commitSpec((current) => {
      const root = current.elements[current.root];

      if (!root) {
        return null;
      }

      return {
        ...current,
        meta: {
          ...current.meta,
          theme: value,
        },
        elements: {
          ...current.elements,
          [current.root]: {
            ...root,
            props: {
              ...root.props,
              theme: value,
            },
          },
        },
      };
    });
  }

  function updateDataset(datasetId: string) {
    commitSpec((current) => ({
      ...current,
      dataBindings: Object.fromEntries(
        Object.entries(current.dataBindings ?? {}).map(([key, binding]) => [
          key,
          typeof binding === "object" && binding !== null
            ? {
                ...binding,
                datasetId,
              }
            : binding,
        ]),
      ),
      meta: {
        ...current.meta,
        datasetId,
      },
    }));
  }

  function updateSelectedBindingField(fieldKey: string, value: string) {
    if (!selectedBindingKey || !isPlainRecord(selectedBinding)) {
      return;
    }

    const currentFields = isPlainRecord(selectedBinding.fields)
      ? selectedBinding.fields
      : {};
    const nextFields =
      fieldKey === "measures" || fieldKey === "columns"
        ? {
            ...currentFields,
            [fieldKey]: value ? [value] : [],
          }
        : {
            ...currentFields,
            [fieldKey]: value || null,
          };
    const nextBindingForPreview = {
      ...selectedBinding,
      fields: nextFields,
    };

    commitSpec((current) => {
      const binding = current.dataBindings?.[selectedBindingKey];

      if (!isPlainRecord(binding)) {
        return null;
      }

      return {
        ...current,
        dataBindings: {
          ...current.dataBindings,
          [selectedBindingKey]: nextBindingForPreview,
        },
      };
    });

    void refreshBindingPreviewData(selectedBindingKey, nextBindingForPreview);
  }

  async function refreshBindingPreviewData(
    bindingKey: string,
    binding: Record<string, unknown>,
  ) {
    const datasetId =
      typeof binding.datasetId === "string" ? binding.datasetId : activeDatasetId;
    const queryPayload = buildDatasetQueryPayloadFromBinding(binding);

    if (!datasetId || !queryPayload) {
      return;
    }

    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/query`, {
        body: JSON.stringify(queryPayload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as WidgetResult;

      setLocalPreviewData((current) => ({
        ...current,
        [bindingKey]: result,
      }));
    } catch {
      // Keep the last preview result if a transient query fails.
    }
  }

  function deleteSelectedElement() {
    if (!selectedElementId) {
      return;
    }

    commitSpec((current) => {
      if (!current?.elements[selectedElementId]) {
        return null;
      }

      const selected = current.elements[selectedElementId];
      const bindingKey = typeof selected.props.bindingKey === "string" ? selected.props.bindingKey : null;
      const nextElements = { ...current.elements };
      const nextBindings = { ...current.dataBindings };
      delete nextElements[selectedElementId];

      for (const [elementId, element] of Object.entries(nextElements)) {
        if (!element.children?.includes(selectedElementId)) {
          continue;
        }

        nextElements[elementId] = {
          ...element,
          children: element.children.filter((childId) => childId !== selectedElementId),
        };
      }

      if (bindingKey) {
        delete nextBindings[bindingKey];
        setLocalPreviewData((currentPreviewData) => {
          const nextPreviewData = { ...currentPreviewData };
          delete nextPreviewData[bindingKey];
          return nextPreviewData;
        });
      }

      return {
        ...current,
        dataBindings: nextBindings,
        elements: nextElements,
      };
    });
    setSelectedElementId(null);
  }

  function addComponent(component: EditorComponent, point: { x: number; y: number }) {
    const nextElementId = spec ? createElementId(component.type, spec.elements) : null;

    if (!nextElementId) {
      return;
    }

    commitSpec((current) => {
      if (!current) {
        return null;
      }

      const id = current.elements[nextElementId]
        ? createElementId(component.type, current.elements)
        : nextElementId;
      const layout = getDefaultLayout(component.type, point, {
        canvasHeight: placementHeight,
        canvasMargin,
        canvasWidth,
        componentGap,
        gridSize,
      });
      const resolvedLayout = resolveLayoutCollision(
        layout,
        getPlacedLayouts(current, id),
        {
          canvasHeight: placementHeight,
          canvasMargin,
          canvasWidth,
          componentGap,
          gridSize,
        },
      );
      const bindingKey = component.queryType === "none" ? undefined : `${id}-binding`;
      if (bindingKey) {
        setLocalPreviewData((currentPreviewData) => ({
          ...currentPreviewData,
          [bindingKey]: createDefaultPreviewResult(component),
        }));
      }
      const nextElement: ScreenElement = {
        children: [],
        props: {
          ...(bindingKey ? { bindingKey } : {}),
          format: null,
          layout: resolvedLayout,
          title: component.name,
        },
        type: component.type,
      };

      return {
        ...current,
        dataBindings: bindingKey
          ? {
              ...current.dataBindings,
              [bindingKey]: createEmptyBinding({
                component,
                datasetId: current.meta?.datasetId ?? "",
                elementId: id,
              }),
            }
          : current.dataBindings,
        elements: {
          ...current.elements,
          [current.root]: {
            ...current.elements[current.root],
            children: [...(current.elements[current.root]?.children ?? []), id],
          },
          [id]: nextElement,
        },
      };
    });

    setSelectedElementId(nextElementId);
  }

  function duplicateSelectedElement() {
    if (!selectedElementId) {
      return;
    }

    commitSpec((current) => {
      const selected = current.elements[selectedElementId];
      const layout = getElementLayout(selected);

      if (!selected || !layout) {
        return null;
      }

      const id = createElementId(selected.type, current.elements);
      const bindingKey =
        typeof selected.props.bindingKey === "string"
          ? `${id}-binding`
          : undefined;
      const sourceBinding =
        typeof selected.props.bindingKey === "string"
          ? current.dataBindings?.[selected.props.bindingKey]
          : undefined;

      return {
        ...current,
        dataBindings: bindingKey
          ? {
              ...current.dataBindings,
              [bindingKey]: {
                ...(typeof sourceBinding === "object" && sourceBinding !== null
                  ? sourceBinding
                  : {}),
                widgetId: id,
              },
            }
          : current.dataBindings,
        elements: {
          ...current.elements,
          [current.root]: {
            ...current.elements[current.root],
            children: [...(current.elements[current.root]?.children ?? []), id],
          },
          [id]: {
            ...selected,
            children: [],
            props: {
              ...selected.props,
              bindingKey,
              layout: clampLayout(
                {
                  ...layout,
                  x: layout.x + 24,
                  y: layout.y + 24,
                },
                canvasWidth,
                placementHeight,
                canvasMargin,
              ),
              title: `${String(selected.props.title ?? selected.type)} 副本`,
            },
          },
        },
      };
    });
  }

  function moveSelectedLayer(direction: "backward" | "forward") {
    if (!selectedElementId) {
      return;
    }

    commitSpec((current) => {
      const root = current.elements[current.root];
      const children = root?.children ?? [];
      const index = children.indexOf(selectedElementId);

      if (index < 0) {
        return null;
      }

      const nextChildren = children.filter((childId) => childId !== selectedElementId);

      if (direction === "forward") {
        nextChildren.push(selectedElementId);
      } else {
        nextChildren.unshift(selectedElementId);
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [current.root]: {
            ...root,
            children: nextChildren,
          },
        },
      };
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const componentType = event.active.data.current?.componentType;

    setActiveComponentType(typeof componentType === "string" ? componentType : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const componentType = event.active.data.current?.componentType;
    const component =
      typeof componentType === "string"
        ? commonComponents.find((item) => item.type === componentType)
        : null;
    const canvas = canvasRef.current;
    const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;

    setActiveComponentType(null);

    if (!component || !canvas || !activeRect) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dropCenter = {
      x: activeRect.left + activeRect.width / 2,
      y: activeRect.top + activeRect.height / 2,
    };

    if (
      dropCenter.x < rect.left ||
      dropCenter.x > rect.right ||
      dropCenter.y < rect.top ||
      dropCenter.y > rect.bottom
    ) {
      return;
    }

    const scale = zoom / 100;
    const x = snapToGrid((dropCenter.x - rect.left) / scale, gridSize);
    const y = snapToGrid((dropCenter.y - rect.top) / scale, gridSize);

    addComponent(component, { x, y });
  }

  function handleElementLayoutCommit(elementId: string, nextLayout: LayoutRect) {
    commitSpec((current) => {
      if (!current) {
        return null;
      }

      const element = current.elements[elementId];
      const currentLayout = getElementLayout(element);

      if (!element || !currentLayout) {
        return null;
      }

      const resolvedLayout = resolveLayoutCollision(
        nextLayout,
        getPlacedLayouts(current, elementId),
        {
          canvasHeight: placementHeight,
          canvasMargin,
          canvasWidth,
          componentGap,
          gridSize,
        },
      );

      if (
        currentLayout.x === resolvedLayout.x &&
        currentLayout.y === resolvedLayout.y &&
        currentLayout.w === resolvedLayout.w &&
        currentLayout.h === resolvedLayout.h
      ) {
        return null;
      }

      return {
        ...current,
        elements: {
          ...current.elements,
          [elementId]: {
            ...element,
            props: {
              ...element.props,
              layout: resolvedLayout,
            },
          },
        },
      };
    });
  }

  return (
    <DndContext id="screen-editor-dnd" onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
    <div className="screen-editor-shell fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#1f2329] text-[#d8dce3]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#2b2f35] px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild className="text-[#cdd2dc] hover:bg-white/8 hover:text-white" size="icon" variant="ghost">
            <Link href="/workbench/screens">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <span className="flex size-4 items-center justify-center rounded-[4px] bg-[#6f82ff] text-white">
            <BarChart3 className="size-3" />
          </span>
          <div className="min-w-0 text-sm font-medium text-white">{screen?.name ?? "大屏名称"}</div>
          <Star className="size-4 text-[#6b717c]" />
          <Separator className="h-5 bg-white/12" orientation="vertical" />
          <Button
            className="size-8 text-[#aeb5c2] hover:bg-white/8 hover:text-white"
            disabled={!undoStack.length}
            onClick={undo}
            size="icon"
            variant="ghost"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            className="size-8 text-[#aeb5c2] hover:bg-white/8 hover:text-white"
            disabled={!redoStack.length}
            onClick={redo}
            size="icon"
            variant="ghost"
          >
            <Redo2 className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-white/12 bg-[#24282e] px-2 text-xs text-[#b9c0cc]">
            <span className="w-9 text-right">{zoom}%</span>
            <button
              className="size-4 rounded-full bg-[#353b44] text-[10px] text-[#d8dce3] hover:bg-white/12"
              onClick={() => setZoom((value) => Math.max(30, value - 5))}
              type="button"
            >
              -
            </button>
            <input
              className="h-1 w-20 accent-[#4f7dff]"
              max={100}
              min={30}
              onChange={(event) => setZoom(Number(event.target.value))}
              type="range"
              value={zoom}
            />
            <button
              className="size-4 rounded-full bg-[#353b44] text-[10px] text-[#d8dce3] hover:bg-white/12"
              onClick={() => setZoom((value) => Math.min(100, value + 5))}
              type="button"
            >
              +
            </button>
          </div>
          <div className="w-56">
            <ConfigSelect
              ariaLabel="数据集"
              label=""
              onChange={updateDataset}
              options={datasets.map((dataset) => ({
                label: dataset.name,
                value: dataset.id,
              }))}
              placeholder="请选择数据集"
              value={globalDatasetId}
            />
          </div>
          <ToolbarItem icon={Settings} label="全局配置" />
          <Button
            className="h-8 border-[#2f73ff] px-4 text-[#6aa0ff] hover:bg-[#246bff]/10 hover:text-[#8bb5ff]"
            variant="outline"
          >
            预览
          </Button>
          <Button
            className="h-8 border-[#2f73ff] px-4 text-[#6aa0ff] hover:bg-[#246bff]/10 hover:text-[#8bb5ff]"
            disabled={!screen?.id || savingStatus !== null}
            onClick={() => void saveStatus("draft")}
            variant="outline"
          >
            {savingStatus === "draft" ? <Spinner className="size-4" /> : <Save className="size-4" />}
            保存
          </Button>
          <Button
            className="h-8 bg-[#246bff] px-4 text-white hover:bg-[#2f73ff]"
            disabled={!screen?.id || savingStatus !== null}
            onClick={() => void saveStatus("published")}
          >
            {savingStatus === "published" ? <Spinner className="size-4" /> : null}
            {isPublished ? "已发布" : "保存并发布"}
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_260px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[#2a2e34]">
          <div className="border-b border-white/10 px-3 py-3">
            <div className="text-sm font-medium text-white">常用组件</div>
            <div className="mt-1 text-xs text-[#87909d]">选择组件添加到画布</div>
          </div>
          <div className="screen-editor-scrollbar min-h-0 flex-1 overflow-auto p-3">
            <div className="grid grid-cols-2 gap-2">
              {commonComponents.map((component) => (
                <ComponentItem
                  componentType={component.type}
                  description={component.description}
                  key={component.type}
                  name={component.name}
                  preview={component.preview}
                />
              ))}
            </div>
          </div>
        </aside>

        <section
          className="screen-editor-scrollbar relative min-h-0 overflow-auto bg-[#111418]"
          onScroll={(event) => {
            setCanvasScroll({
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            });
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(105,118,138,0.42)_1.2px,transparent_1.2px)] bg-[size:30px_30px]" />
          <div className="sticky left-0 top-0 z-30 h-0">
            <div
              className="border-b border-r border-white/10 bg-[#1b1f25]"
              style={{ height: RULER_SIZE, width: RULER_SIZE }}
            />
          </div>
          <Ruler
            canvasHeight={canvasHeight}
            canvasWidth={canvasWidth}
            orientation="horizontal"
            overflow={CANVAS_RULER_OVERFLOW}
            scrollOffset={canvasScroll.left}
            zoom={zoom}
          />
          <Ruler
            canvasHeight={canvasHeight}
            canvasWidth={canvasWidth}
            orientation="vertical"
            overflow={CANVAS_RULER_OVERFLOW}
            scrollOffset={canvasScroll.top}
            zoom={zoom}
          />
          <div
            className="relative min-h-full min-w-[1260px] pb-10"
            style={{
              paddingLeft: RULER_SIZE + CANVAS_RULER_OVERFLOW,
              paddingTop: RULER_SIZE + CANVAS_RULER_OVERFLOW,
            }}
          >
            <div
              className="origin-top overflow-visible bg-transparent shadow-[0_24px_80px_rgba(0,0,0,0.38)] outline outline-1 outline-[#3b4652]"
              style={{
                height: placementHeight * (zoom / 100),
                width: canvasWidth * (zoom / 100),
              }}
            >
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-[#aeb5c2]">
                  <Spinner className="mr-2" />
                  正在加载大屏
                </div>
              ) : spec ? (
                <div
                  className={cn(
                    "relative origin-top-left overflow-visible",
                    isCanvasDropping && "outline outline-1 outline-[#4f7dff]",
                  )}
                  onClick={() => setSelectedElementId(null)}
                  ref={(node) => {
                    canvasRef.current = node;
                    setCanvasDropRef(node);
                  }}
                  style={{
                    transform: `scale(${zoom / 100})`,
                    height: placementHeight,
                    width: canvasWidth,
                  }}
                >
                  <ScreenPreview
                    align="start"
                    disableAutoScale
                    previewData={previewData}
                    spec={previewSpec ?? spec}
                  />
                  <EditorSelectionLayer
                    canvasHeight={placementHeight}
                    canvasMargin={canvasMargin}
                    canvasWidth={canvasWidth}
                    componentGap={componentGap}
                    gridSize={gridSize}
                    guideOverflow={CANVAS_RULER_OVERFLOW + RULER_SIZE}
                    onLayoutCommit={handleElementLayoutCommit}
                    onSelect={(elementId) => setSelectedElementId(elementId || null)}
                    selectedElementId={selectedElementId}
                    spec={spec}
                    zoom={zoom}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#dfe5ef]">
                  选择左侧组件开始编辑
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="screen-editor-scrollbar min-h-0 overflow-auto border-l border-white/10 bg-[#2d3137] text-xs">
          <div className="border-b border-white/10 px-3 py-3 text-sm font-medium text-white">
            {selectedElement ? "组件配置" : "全局配置"}
          </div>
          <div className="space-y-5 p-3">
            {selectedElement && selectedLayout ? (
              <>
                <div className="relative">
                  <Search className="absolute top-2.5 left-2 size-3.5 text-[#8f98a8]" />
                  <Input
                    className="h-8 border-white/14 bg-[#24282e] pl-7 text-xs text-white placeholder:text-[#87909d]"
                    placeholder="搜索"
                  />
                </div>
                <ConfigGroup title="基础配置">
                  <ConfigTextInput
                    label="标题"
                    onChange={updateElementTitle}
                    value={String(selectedElement.props.title ?? "")}
                  />
                  <ConfigRow label="类型" value={selectedElement.type} />
                  {selectedElement.type === "TextBlock" ? (
                    <ConfigTextInput
                      label="内容"
                      onChange={(value) => updateElementProp("content", value)}
                      value={String(selectedElement.props.content ?? "")}
                    />
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <ConfigNumberInput
                      label="X"
                      onChange={(value) =>
                        updateElementLayout(selectedElementId ?? "", {
                          ...selectedLayout,
                          x: value,
                        })
                      }
                      value={selectedLayout.x}
                    />
                    <ConfigNumberInput
                      label="Y"
                      onChange={(value) =>
                        updateElementLayout(selectedElementId ?? "", {
                          ...selectedLayout,
                          y: value,
                        })
                      }
                      value={selectedLayout.y}
                    />
                    <ConfigNumberInput
                      label="宽度"
                      onChange={(value) => {
                        const nextWidth = getSpanWidth(
                          value,
                          getColumnWidth(canvasWidth, canvasMargin, componentGap),
                          componentGap,
                        );
                        updateElementLayout(selectedElementId ?? "", {
                          ...selectedLayout,
                          w: nextWidth,
                        });
                      }}
                      options={[
                        { label: "4 列", value: 4 },
                        { label: "6 列", value: 6 },
                        { label: "8 列", value: 8 },
                        { label: "12 列", value: 12 },
                      ]}
                      value={getNearestColumnSpan(selectedLayout.w, canvasWidth, canvasMargin, componentGap)}
                    />
                    <ConfigNumberInput
                      label="H"
                      onChange={(value) => {
                        updateElementLayoutAndReflow(selectedElementId ?? "", {
                          ...selectedLayout,
                          h: value,
                        });
                      }}
                      value={selectedLayout.h}
                    />
                  </div>
                </ConfigGroup>
                <ConfigGroup title="数据绑定">
                  <ConfigRow label="数据集" value={datasetName} />
                  <DataBindingSlots
                    binding={selectedBinding}
                    fields={datasetFields}
                    onChange={updateSelectedBindingField}
                  />
                </ConfigGroup>
                <ConfigGroup title="编排操作">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="border-white/12 text-[#d8dce3] hover:bg-white/8"
                      onClick={duplicateSelectedElement}
                      size="sm"
                      variant="outline"
                    >
                      <Copy className="size-4" />
                      复制
                    </Button>
                    <Button
                      className="border-white/12 text-[#d8dce3] hover:bg-white/8"
                      onClick={() => moveSelectedLayer("forward")}
                      size="sm"
                      variant="outline"
                    >
                      <BringToFront className="size-4" />
                      置顶
                    </Button>
                    <Button
                      className="border-white/12 text-[#d8dce3] hover:bg-white/8"
                      onClick={() => moveSelectedLayer("backward")}
                      size="sm"
                      variant="outline"
                    >
                      <SendToBack className="size-4" />
                      置底
                    </Button>
                  </div>
                </ConfigGroup>
                <Button
                  className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  onClick={deleteSelectedElement}
                  size="sm"
                  variant="outline"
                >
                  <Trash2 className="size-4" />
                  删除组件
                </Button>
              </>
            ) : (
              <>
                <ConfigGroup title="大屏尺寸">
                  <ConfigSelect
                    label="屏幕尺寸"
                    onChange={updateCanvasSize}
                    options={[
                      { label: "1920 x 1080 px", value: "1920x1080" },
                      { label: "3840 x 2160 px", value: "3840x2160" },
                    ]}
                    placeholder="请选择屏幕尺寸"
                    value={`${canvasWidth}x${canvasHeight}`}
                  />
                  <ConfigSelect
                    label="缩放方式"
                    onChange={(value) => updateRootProp("scaleMode", value)}
                    options={[
                      { label: "自动适配", value: "auto" },
                      { label: "全屏铺满（按屏幕比）", value: "cover-screen" },
                      { label: "全屏铺满（图表等比）", value: "cover-ratio" },
                      { label: "宽度铺满", value: "fit-width" },
                      { label: "高度铺满", value: "fit-height" },
                      { label: "不缩放", value: "none" },
                    ]}
                    placeholder="请选择缩放方式"
                    value={scaleMode}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ConfigNumberInput
                      label="画布边距"
                      onChange={(value) => updateRootNumberProp("canvasMargin", value)}
                      suffix="px"
                      value={canvasMargin}
                    />
                    <ConfigNumberInput
                      label="组件间距"
                      onChange={(value) => updateRootNumberProp("componentGap", value)}
                      suffix="px"
                      value={componentGap}
                    />
                  </div>
                </ConfigGroup>

                <ConfigGroup title="全局样式">
                  <ConfigSelect
                    label="主题"
                    onChange={updateTheme}
                    options={[
                      { label: "浅色", value: "light" },
                      { label: "深色", value: "dark" },
                    ]}
                    placeholder="请选择主题"
                    value={theme}
                  />
                </ConfigGroup>
              </>
            )}

            {message ? <div className="rounded border border-[#3d5685] bg-[#25314a] p-2 text-[#9abaff]">{message}</div> : null}
          </div>
        </aside>
      </main>
    </div>
    <DragOverlay dropAnimation={null}>
      {activeComponentType ? (
        <div className="w-36 overflow-hidden rounded-md border border-[#4f7dff]/70 bg-[#303743] text-left shadow-2xl">
          <ComponentPreview
            type={commonComponents.find((component) => component.type === activeComponentType)?.preview ?? "bar"}
          />
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}

function ToolbarItem({
  icon: Icon,
  label,
  muted = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex h-8 items-center gap-1.5 rounded px-2 text-xs hover:bg-white/8",
        muted ? "text-[#858b96]" : "text-[#c6ccd6]",
      )}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ComponentItem({
  componentType,
  description,
  name,
  preview,
}: {
  componentType: string;
  description: string;
  name: string;
  preview: string;
}) {
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    data: { componentType },
    id: `component-${componentType}`,
  });

  return (
    <button
      className={cn(
        "group w-full overflow-hidden rounded-md border border-white/8 bg-[#24282e] text-left transition-colors hover:border-[#4f7dff]/70 hover:bg-[#303743]",
        isDragging && "opacity-45",
      )}
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      <ComponentPreview type={preview} />
      <div className="border-t border-white/8 px-2 py-2">
        <div className="text-xs font-medium text-white">{name}</div>
        <div className="mt-0.5 truncate text-[11px] text-[#89909c]">{description}</div>
      </div>
    </button>
  );
}

function ComponentPreview({ type }: { type: string }) {
  return (
    <div className="h-16 overflow-hidden bg-[#1f2329] p-2.5">
      {type === "metric" ? (
        <div className="flex h-full flex-col justify-between rounded border border-white/10 bg-[#2c323b] p-2">
          <span className="h-2 w-14 rounded bg-[#8c96a8]/60" />
          <span className="h-4 w-24 rounded bg-white/85" />
          <span className="h-1.5 w-16 rounded bg-[#21c68a]" />
        </div>
      ) : null}
      {type === "header" ? (
        <div className="flex h-full flex-col items-center justify-center rounded border border-white/10 bg-[#2c323b]">
          <span className="h-3 w-24 rounded bg-white/85" />
          <span className="mt-2 h-1.5 w-16 rounded bg-[#87909d]/55" />
        </div>
      ) : null}
      {type === "progress" ? (
        <div className="flex h-full flex-col justify-center gap-2 rounded border border-white/10 bg-[#2c323b] p-2">
          <div className="flex items-center justify-between">
            <span className="h-3 w-16 rounded bg-white/80" />
            <span className="h-3 w-8 rounded bg-[#22c55e]" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#3b424d]">
            <span className="block h-full w-[72%] rounded-full bg-[#4f7dff]" />
          </div>
        </div>
      ) : null}
      {type === "line" ? (
        <svg className="h-full w-full" viewBox="0 0 180 56">
          <path d="M4 42 C24 18, 38 18, 54 36 S84 48, 102 22 S130 12, 150 30 S168 40, 176 20" fill="none" stroke="#4f7dff" strokeWidth="3" />
          <path d="M4 42 C24 18, 38 18, 54 36 S84 48, 102 22 S130 12, 150 30 S168 40, 176 20 L176 54 L4 54 Z" fill="#4f7dff" opacity="0.18" />
        </svg>
      ) : null}
      {type === "multiLine" ? (
        <svg className="h-full w-full" viewBox="0 0 180 56">
          <path d="M4 42 C28 20, 42 24, 60 34 S94 46, 116 20 S146 14, 176 28" fill="none" stroke="#4f7dff" strokeWidth="2.6" />
          <path d="M4 30 C26 44, 44 38, 62 18 S96 10, 118 34 S148 44, 176 18" fill="none" stroke="#22c55e" strokeWidth="2.3" />
        </svg>
      ) : null}
      {type === "area" ? (
        <svg className="h-full w-full" viewBox="0 0 180 56">
          <path d="M4 40 C24 28, 42 30, 58 20 S88 14, 108 30 S142 44, 176 16 L176 54 L4 54 Z" fill="#4f7dff" opacity="0.32" />
          <path d="M4 40 C24 28, 42 30, 58 20 S88 14, 108 30 S142 44, 176 16" fill="none" stroke="#4f7dff" strokeWidth="2.6" />
        </svg>
      ) : null}
      {type === "bar" ? (
        <div className="flex h-full items-end gap-2 px-2">
          {[52, 36, 44, 28, 48, 22].map((height, index) => (
            <span className="flex-1 rounded-t bg-[#4f7dff]" key={index} style={{ height }} />
          ))}
        </div>
      ) : null}
      {type === "multiBar" ? (
        <div className="flex h-full items-end gap-1 px-2">
          {[48, 32, 38, 44, 28, 36, 52, 22].map((height, index) => (
            <span
              className={cn("flex-1 rounded-t", index % 2 === 0 ? "bg-[#4f7dff]" : "bg-[#22c55e]")}
              key={index}
              style={{ height }}
            />
          ))}
        </div>
      ) : null}
      {type === "pie" ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-[conic-gradient(#4f7dff_0_42%,#22c55e_42%_68%,#f59e0b_68%_83%,#8b5cf6_83%_100%)]" />
        </div>
      ) : null}
      {type === "donut" ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-[conic-gradient(#4f7dff_0_42%,#22c55e_42%_68%,#f59e0b_68%_83%,#8b5cf6_83%_100%)]">
            <div className="m-3 h-6 w-6 rounded-full bg-[#1f2329]" />
          </div>
        </div>
      ) : null}
      {type === "radar" ? (
        <svg className="h-full w-full" viewBox="0 0 120 56">
          <polygon points="60,5 102,20 92,50 28,50 18,20" fill="none" stroke="#475160" />
          <polygon points="60,14 88,23 80,43 34,42 30,24" fill="#4f7dff" opacity="0.25" stroke="#4f7dff" strokeWidth="2" />
        </svg>
      ) : null}
      {type === "radial" ? (
        <div className="flex h-full items-center justify-center gap-2">
          {[42, 32, 24].map((size, index) => (
            <div
              className="rounded-full border-[5px] border-[#4f7dff] border-r-[#343a44] border-b-[#343a44]"
              key={index}
              style={{ height: size, width: size }}
            />
          ))}
        </div>
      ) : null}
      {type === "rank" ? (
        <div className="flex h-full flex-col justify-center gap-1">
          {[72, 58, 44].map((width, index) => (
            <div className="flex items-center gap-2" key={index}>
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded bg-[#343a44] text-[8px] leading-none text-[#cfd5df]">{index + 1}</span>
              <span className="h-1.5 rounded bg-[#4f7dff]" style={{ width }} />
            </div>
          ))}
        </div>
      ) : null}
      {type === "table" ? (
        <div className="grid h-full grid-rows-4 overflow-hidden rounded border border-white/10">
          {Array.from({ length: 4 }, (rowItem, row) => (
            <div className="grid grid-cols-3 border-b border-white/8 last:border-b-0" key={row}>
              {Array.from({ length: 3 }, (columnItem, column) => (
                <span className={cn("border-r border-white/8 last:border-r-0", row === 0 ? "bg-[#343a44]" : "bg-[#252b33]")} key={column} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {type === "text" ? (
        <div className="flex h-full flex-col justify-center gap-2">
          <span className="h-3 w-24 rounded bg-white/80" />
          <span className="h-2 w-36 rounded bg-[#87909d]/60" />
          <span className="h-2 w-28 rounded bg-[#87909d]/45" />
        </div>
      ) : null}
    </div>
  );
}

function EditorSelectionLayer({
  canvasHeight,
  canvasMargin,
  canvasWidth,
  componentGap,
  gridSize,
  guideOverflow,
  onLayoutCommit,
  onSelect,
  selectedElementId,
  spec,
  zoom,
}: {
  canvasHeight: number;
  canvasMargin: number;
  canvasWidth: number;
  componentGap: number;
  gridSize: number;
  guideOverflow: number;
  onLayoutCommit: (elementId: string, layout: LayoutRect) => void;
  onSelect: (elementId: string) => void;
  selectedElementId: string | null;
  spec: JsonRenderSpec;
  zoom: number;
}) {
  const children = getRootChildren(spec);
  const [dragState, setDragState] = useState<{
    elementId: string;
    hasMoved: boolean;
    layout: LayoutRect;
    pointerId: number;
    startLayout: LayoutRect;
    startX: number;
    startY: number;
  } | null>(null);
  const scale = zoom / 100;
  const guideOverflowInCanvasUnits = guideOverflow / scale;

  const selectedGuideLayout =
    dragState?.elementId === selectedElementId
      ? dragState.layout
      : selectedElementId
        ? getElementLayout(spec.elements[selectedElementId])
        : null;
  const guideX = selectedGuideLayout
    ? selectedGuideLayout.x + guideOverflowInCanvasUnits
    : 0;
  const guideY = selectedGuideLayout
    ? selectedGuideLayout.y + guideOverflowInCanvasUnits
    : 0;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      style={{ height: canvasHeight, width: canvasWidth }}
    >
      {selectedGuideLayout ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            bottom: 0,
            left: -guideOverflowInCanvasUnits,
            right: 0,
            top: -guideOverflowInCanvasUnits,
          }}
        >
          <div
            className="absolute bottom-0 top-0 w-px bg-[#7c9cff] shadow-[0_0_8px_rgba(79,125,255,0.7)]"
            style={{
              left: guideX,
            }}
          />
          <div
            className="absolute left-0 right-0 h-px bg-[#7c9cff] shadow-[0_0_8px_rgba(79,125,255,0.7)]"
            style={{
              top: guideY,
            }}
          />
          <div
            className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#4f7dff] shadow-[0_0_0_4px_rgba(79,125,255,0.3),0_0_18px_rgba(79,125,255,0.9)]"
            style={{
              left: guideX,
              top: guideY,
            }}
          />
          <div
            className="absolute -translate-x-full -translate-y-full rounded-sm border border-[#9fb0ff] bg-[#2542a5] px-3 py-1.5 font-mono text-base font-semibold leading-none text-white shadow-[0_6px_18px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.12)]"
            style={{
              left: guideX - 8,
              top: guideY - 8,
            }}
          >
            {Math.round(selectedGuideLayout.x)}, {Math.round(selectedGuideLayout.y)}
          </div>
        </div>
      ) : null}
      {children.map((elementId) => {
        const element = spec.elements[elementId];
        const specElementLayout = getElementLayout(element);
        const activeLayout =
          dragState?.elementId === elementId ? dragState.layout : specElementLayout;

        if (!element || !activeLayout) {
          return null;
        }

        return (
          <div
            className={cn(
              "pointer-events-auto absolute z-20 cursor-grab rounded-xl",
              dragState?.elementId === elementId && "z-20 cursor-grabbing",
              selectedElementId === elementId &&
                "shadow-[0_0_0_1px_rgba(79,125,255,0.95)]",
            )}
            key={elementId}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(elementId);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }

              event.currentTarget.setPointerCapture(event.pointerId);
              event.stopPropagation();
              onSelect(elementId);
              setDragState({
                elementId,
                hasMoved: false,
                layout: activeLayout,
                pointerId: event.pointerId,
                startLayout: activeLayout,
                startX: event.clientX,
                startY: event.clientY,
              });
            }}
            onPointerMove={(event) => {
              if (!dragState || dragState.elementId !== elementId) {
                return;
              }

              const deltaX = (event.clientX - dragState.startX) / scale;
              const deltaY = (event.clientY - dragState.startY) / scale;
              const moved = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);

              if (moved < 3 && !dragState.hasMoved) {
                return;
              }

              setDragState({
                ...dragState,
                hasMoved: true,
                layout: resolveLayoutCollision(
                  clampLayout(
                    {
                      ...dragState.startLayout,
                      x: snapToGrid(dragState.startLayout.x + deltaX, gridSize),
                      y: snapToGrid(dragState.startLayout.y + deltaY, gridSize),
                    },
                    canvasWidth,
                    canvasHeight,
                    canvasMargin,
                  ),
                  getPlacedLayouts(spec, elementId),
                  {
                    canvasHeight,
                    canvasMargin,
                    canvasWidth,
                    componentGap,
                    gridSize,
                  },
                ),
              });
            }}
            onPointerUp={(event) => {
              if (!dragState || dragState.elementId !== elementId) {
                return;
              }

              event.currentTarget.releasePointerCapture(dragState.pointerId);
              setDragState(null);

              if (dragState.hasMoved) {
                onLayoutCommit(
                  elementId,
                  clampLayout(dragState.layout, canvasWidth, canvasHeight, canvasMargin),
                );
              }
            }}
            style={{
              height: activeLayout.h,
              left: activeLayout.x,
              top: activeLayout.y,
              width: activeLayout.w,
            }}
          />
        );
      })}
    </div>
  );
}

function getRootChildren(spec: JsonRenderSpec): string[] {
  return spec.elements[spec.root]?.children ?? [];
}

function getDataBindingSlots(binding: unknown): Array<{
  fieldKey: string;
  key: string;
  label: string;
  required?: boolean;
  role: "all" | "dimension" | "measure";
  value: string;
}> {
  if (!isPlainRecord(binding)) {
    return [];
  }

  const queryType = String(binding.queryType ?? "");
  const fields = isPlainRecord(binding.fields) ? binding.fields : {};

  if (queryType === "metric") {
    return [
      {
        fieldKey: "measure",
        key: "measure",
        label: "值轴/度量",
        required: true,
        role: "measure",
        value: formatFieldValue(fields.measure ?? fields.measures),
      },
    ];
  }

  if (queryType === "trend") {
    return [
      {
        fieldKey: "time",
        key: "time",
        label: "类别轴/维度",
        required: true,
        role: "dimension",
        value: formatFieldValue(fields.time),
      },
      {
        fieldKey: "measure",
        key: "measure",
        label: "值轴/度量",
        required: true,
        role: "measure",
        value: formatFieldValue(fields.measure ?? fields.measures),
      },
    ];
  }

  if (queryType === "breakdown") {
    return [
      {
        fieldKey: "dimension",
        key: "dimension",
        label: "类别轴/维度",
        required: true,
        role: "dimension",
        value: formatFieldValue(fields.dimension),
      },
      {
        fieldKey: "measure",
        key: "measure",
        label: "值轴/度量",
        required: true,
        role: "measure",
        value: formatFieldValue(fields.measure ?? fields.measures),
      },
    ];
  }

  if (queryType === "table") {
    return [
      {
        fieldKey: "columns",
        key: "columns",
        label: "表格字段",
        required: true,
        role: "all",
        value: formatFieldValue(fields.columns),
      },
    ];
  }

  return [];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDatasetFields(fields: unknown[]): DatasetFieldOption[] {
  return fields.flatMap((field) => {
    if (!isPlainRecord(field)) {
      return [];
    }

    const fieldId = String(field.id ?? "");

    if (!fieldId) {
      return [];
    }

    return [
      {
        aggregation:
          typeof field.aggregation === "string" ? field.aggregation : null,
        dataType: String(field.data_type ?? ""),
        displayName: String(field.display_name ?? field.source_name ?? fieldId),
        fieldId,
        semanticType: String(field.semantic_type ?? ""),
      },
    ];
  });
}

function filterFieldsBySlotRole(
  fields: DatasetFieldOption[],
  role: "all" | "dimension" | "measure",
) {
  if (role === "all") {
    return fields;
  }

  if (role === "measure") {
    return fields.filter((field) => field.semanticType === "measure");
  }

  return fields.filter((field) =>
    field.semanticType === "dimension" || field.semanticType === "time",
  );
}

function buildDatasetQueryPayloadFromBinding(binding: Record<string, unknown>) {
  const fields = isPlainRecord(binding.fields) ? binding.fields : {};
  const queryType = String(binding.queryType ?? "");
  const aggregation = String(binding.aggregation ?? "sum");
  const dimensions: Array<{ alias?: string; field: string }> = [];
  const measures: Array<{ aggregation: string; alias: string; field: string }> = [];

  if (queryType === "trend" && typeof fields.time === "string" && fields.time) {
    dimensions.push({ alias: "x", field: fields.time });
  } else if (
    (queryType === "breakdown" || queryType === "table") &&
    typeof fields.dimension === "string" &&
    fields.dimension
  ) {
    dimensions.push({
      alias: queryType === "breakdown" ? "label" : undefined,
      field: fields.dimension,
    });
  }

  if (queryType === "table" && Array.isArray(fields.columns)) {
    for (const field of fields.columns) {
      if (typeof field === "string" && field) {
        dimensions.push({ field });
      }
    }
  } else if (typeof fields.measure === "string" && fields.measure) {
    measures.push({
      aggregation,
      alias: queryType === "trend" ? "y" : "value",
      field: fields.measure,
    });
  } else if (Array.isArray(fields.measures)) {
    for (const field of fields.measures) {
      if (typeof field === "string" && field) {
        measures.push({ aggregation, alias: field, field });
      }
    }
  }

  if (
    (queryType === "metric" && measures.length === 0) ||
    (queryType === "trend" && (dimensions.length === 0 || measures.length === 0)) ||
    (queryType === "breakdown" && (dimensions.length === 0 || measures.length === 0)) ||
    (queryType === "table" && dimensions.length === 0)
  ) {
    return null;
  }

  return {
    dimensions,
    granularity:
      binding.granularity === "day" ||
      binding.granularity === "week" ||
      binding.granularity === "month"
        ? binding.granularity
        : null,
    limit: typeof binding.limit === "number" ? binding.limit : null,
    measures,
    query_type: queryType,
    sort:
      queryType === "trend"
        ? [{ direction: "asc", field: "x" }]
        : queryType === "breakdown" && measures[0]
          ? [{ direction: "desc", field: measures[0].alias }]
          : [],
  };
}

function formatFieldValue(field: unknown) {
  if (Array.isArray(field)) {
    return field.filter(Boolean).join("、");
  }

  return typeof field === "string" ? field : "";
}

function ConfigGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1 text-sm font-medium text-white">
        <ChevronDown className="size-3.5" />
        {title}
      </div>
      {children}
    </section>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[#aeb5c2]">
      <span>{label}</span>
      <span className="min-w-0 truncate text-[#d8dce3]">{value}</span>
    </div>
  );
}

function DataBindingSlots({
  binding,
  fields,
  onChange,
}: {
  binding: unknown;
  fields: DatasetFieldOption[];
  onChange: (fieldKey: string, value: string) => void;
}) {
  const slots = getDataBindingSlots(binding);

  if (!slots.length) {
    return (
      <div className="rounded border border-dashed border-white/12 px-3 py-2 text-center text-xs text-[#8f98a8]">
        当前组件无需数据绑定
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <FieldSelectSlot
          fields={filterFieldsBySlotRole(fields, slot.role)}
          key={`${slot.key}-${slot.value || "empty"}`}
          label={slot.label}
          onChange={(value) => onChange(slot.fieldKey, value)}
          required={slot.required}
          value={slot.value}
        />
      ))}
    </div>
  );
}

function FieldSelectSlot({
  fields,
  label,
  onChange,
  required,
  value,
}: {
  fields: DatasetFieldOption[];
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const selectValue = value || undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-[#d8dce3]">
        <span>
          {required ? <span className="mr-1 text-red-400">*</span> : null}
          {label}
        </span>
        <Settings className="size-3.5 text-[#8f98a8]" />
      </div>
      <Select onValueChange={onChange} value={selectValue}>
        <SelectTrigger className="h-8 w-full border-dashed border-white/18 bg-[#24282e] text-xs text-white">
          <SelectValue placeholder="请选择字段" />
        </SelectTrigger>
        <SelectContent
          className="screen-editor-select-content z-[80] border-white/12 bg-[#24282e] text-[#d8dce3]"
          position="popper"
        >
          {fields.map((field) => (
            <SelectItem
              className="!border-l-2 !border-transparent !bg-transparent text-xs !text-[#d8dce3] hover:!bg-white/8 hover:!text-white focus:!bg-white/8 focus:!text-white data-[highlighted]:!bg-white/8 data-[highlighted]:!text-white data-[state=checked]:!border-[#6f82ff] data-[state=checked]:!bg-transparent data-[state=checked]:!text-white data-[state=checked]:data-[highlighted]:!bg-white/8 [&_[data-slot='select-item-indicator']]:!text-[#9fb0ff]"
              key={field.fieldId}
              value={field.fieldId}
            >
              {field.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ConfigTextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1.5 text-[#aeb5c2]">
      <span>{label}</span>
      <Input
        className="h-8 border-white/12 bg-[#24282e] text-xs text-white"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function ConfigNumberInput({
  label,
  onChange,
  options,
  suffix,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  options?: Array<{ label: string; value: number }>;
  suffix?: string;
  value: number;
}) {
  if (options?.length) {
    return (
      <label className="grid gap-1.5 text-[#aeb5c2]">
        <span>{label}</span>
        <Select onValueChange={(nextValue) => onChange(Number(nextValue))} value={String(value)}>
          <SelectTrigger className="h-8 w-full border-white/12 bg-[#24282e] text-xs text-white">
            <SelectValue placeholder={`选择${label}`} />
          </SelectTrigger>
          <SelectContent
            className="screen-editor-select-content z-[80] border-white/12 bg-[#24282e] text-[#d8dce3]"
            position="popper"
          >
            {options.map((option) => (
              <SelectItem
                className="!border-l-2 !border-transparent !bg-transparent text-xs !text-[#d8dce3] hover:!bg-white/8 hover:!text-white focus:!bg-white/8 focus:!text-white data-[highlighted]:!bg-white/8 data-[highlighted]:!text-white data-[state=checked]:!border-[#6f82ff] data-[state=checked]:!bg-transparent data-[state=checked]:!text-white data-[state=checked]:data-[highlighted]:!bg-white/8 [&_[data-slot='select-item-indicator']]:!text-[#9fb0ff]"
                key={option.value}
                value={String(option.value)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }

  return (
    <label className="grid gap-1.5 text-[#aeb5c2]">
      <span>{label}</span>
      <div className="relative">
        <Input
          className={cn(
            "h-8 border-white/12 bg-[#24282e] text-xs text-white",
            suffix && "pr-8",
          )}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          type="number"
          value={value}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-[#89909c]">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function ConfigSelect({
  ariaLabel,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel?: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  value: string;
}) {
  const selectValue = value || undefined;

  return (
    <label className="grid gap-1.5 text-[#aeb5c2]">
      {label ? <span>{label}</span> : null}
      <Select onValueChange={onChange} value={selectValue}>
        <SelectTrigger
          aria-label={ariaLabel || label}
          className="h-8 w-full border-white/12 bg-[#24282e] text-xs text-white"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          className="screen-editor-select-content z-[80] border-white/12 bg-[#24282e] text-[#d8dce3]"
          position="popper"
        >
          {options.map((option) => (
            <SelectItem
              className="!border-l-2 !border-transparent !bg-transparent text-xs !text-[#d8dce3] hover:!bg-white/8 hover:!text-white focus:!bg-white/8 focus:!text-white data-[highlighted]:!bg-white/8 data-[highlighted]:!text-white data-[state=checked]:!border-[#6f82ff] data-[state=checked]:!bg-transparent data-[state=checked]:!text-white data-[state=checked]:data-[highlighted]:!bg-white/8 [&_[data-slot='select-item-indicator']]:!text-[#9fb0ff]"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function createBlankSpec(datasetId?: string): JsonRenderSpec {
  return {
    dataBindings: {},
    elements: {
      "screen-root": {
        children: [],
        props: {
          canvasMargin: DEFAULT_CANVAS_MARGIN,
          componentGap: DEFAULT_COMPONENT_GAP,
          layout: { h: 1080, w: 1920, x: 0, y: 0 },
          scaleMode: "auto",
          theme: "light",
          title: "未命名大屏",
        },
        type: "DashboardRoot",
      },
    },
    meta: {
      ...(datasetId ? { datasetId } : {}),
      theme: "light",
      title: "未命名大屏",
    },
    root: "screen-root",
    version: "1.0",
  };
}

function getRootNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getSpecContentHeight(spec: JsonRenderSpec | null | undefined, fallback: number): number {
  if (!spec) {
    return fallback;
  }

  return Object.entries(spec.elements).reduce((height, [elementId, element]) => {
    if (elementId === spec.root) {
      return height;
    }

    const layout = getElementLayout(element);
    return layout ? Math.max(height, layout.y + layout.h + DEFAULT_CANVAS_MARGIN) : height;
  }, fallback);
}

function withRootHeight(spec: JsonRenderSpec, height: number): JsonRenderSpec {
  const root = spec.elements[spec.root];
  const layout = getElementLayout(root);

  if (!root || !layout || layout.h === height) {
    return spec;
  }

  return {
    ...spec,
    elements: {
      ...spec.elements,
      [spec.root]: {
        ...root,
        props: {
          ...root.props,
          layout: {
            ...layout,
            h: height,
          },
        },
      },
    },
  };
}

function getElementLayout(element: ScreenElement | null | undefined): LayoutRect | null {
  const layout = element?.props.layout;

  if (!isLayout(layout)) {
    return null;
  }

  return layout;
}

function isLayout(value: unknown): value is LayoutRect {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const layout = value as Record<string, unknown>;

  return ["h", "w", "x", "y"].every((key) => typeof layout[key] === "number");
}

function getDefaultLayout(
  type: string,
  point: { x: number; y: number },
  options: {
    canvasHeight: number;
    canvasMargin: number;
    canvasWidth: number;
    componentGap: number;
    gridSize: number;
  },
): LayoutRect {
  const { canvasHeight, canvasMargin, canvasWidth, componentGap, gridSize } = options;
  const defaultHeights: Record<string, number> = {
    AreaChart: 348,
    BarChart: 348,
    DataTable: 348,
    DonutChart: 348,
    LineChart: 348,
    MetricCard: 128,
    MultiBarChart: 348,
    MultiLineChart: 348,
    PieChart: 348,
    ProgressCard: 128,
    RadarChart: 348,
    RadialChart: 348,
    RankList: 348,
    SectionHeader: 72,
    TextBlock: 120,
  };
  const columns = getDefaultColumnSpan(type);
  const columnWidth = getColumnWidth(canvasWidth, canvasMargin, componentGap);
  const size = {
    h: defaultHeights[type] ?? 320,
    w: getSpanWidth(columns, columnWidth, componentGap),
  };
  const columnX = getNearestColumnX(point.x - size.w / 2, {
    canvasMargin,
    columnWidth,
    componentGap,
  });

  return clampLayout(
    {
      h: size.h,
      w: size.w,
      x: snapToGrid(columnX, gridSize),
      y: snapToGrid(point.y - size.h / 2, gridSize),
    },
    canvasWidth,
    canvasHeight,
    canvasMargin,
  );
}

function getDefaultColumnSpan(type: string): number {
  if (AUXILIARY_COMPONENT_TYPES.has(type)) {
    return 4;
  }

  return 12;
}

function reflowElementsForLayoutConfig(
  spec: JsonRenderSpec,
  options: {
    canvasHeight: number;
    canvasWidth: number;
    nextGap: number;
    nextMargin: number;
    previousGap: number;
    previousMargin: number;
  },
) {
  const {
    canvasHeight,
    canvasWidth,
    nextGap,
    nextMargin,
    previousGap,
    previousMargin,
  } = options;
  const previousColumnWidth = getColumnWidth(canvasWidth, previousMargin, previousGap);
  const nextColumnWidth = getColumnWidth(canvasWidth, nextMargin, nextGap);
  const previousUnit = previousColumnWidth + previousGap;
  const nextUnit = nextColumnWidth + nextGap;

  const scaledElements = Object.fromEntries(
    Object.entries(spec.elements).map(([elementId, element]) => {
      if (elementId === spec.root) {
        return [elementId, element];
      }

      const layout = getElementLayout(element);

      if (!layout) {
        return [elementId, element];
      }

      const span = getNearestColumnSpan(layout.w, canvasWidth, previousMargin, previousGap);
      const columnIndex = Math.max(
        0,
        Math.min(
          DEFAULT_LAYOUT_COLUMNS - span,
          Math.round((layout.x - previousMargin) / previousUnit),
        ),
      );
      const rowIndex = Math.max(
        0,
        Math.round((layout.y - previousMargin) / (layout.h + previousGap)),
      );
      const nextLayout = clampLayout(
        {
          ...layout,
          w: getSpanWidth(span, nextColumnWidth, nextGap),
          x: Math.round(nextMargin + columnIndex * nextUnit),
          y: Math.round(nextMargin + rowIndex * (layout.h + nextGap)),
        },
        canvasWidth,
        canvasHeight,
        nextMargin,
      );

      return [
        elementId,
        {
          ...element,
          props: {
            ...element.props,
            layout: nextLayout,
          },
        },
      ];
    }),
  );

  return reflowRows(
    {
      ...spec,
      elements: scaledElements,
    },
    {
      canvasMargin: nextMargin,
      componentGap: nextGap,
    },
  );
}

function reflowRows(
  spec: JsonRenderSpec,
  options: {
    canvasMargin: number;
    componentGap: number;
  },
) {
  const { canvasMargin, componentGap } = options;
  const rows = groupElementRows(spec);
  const nextElements = { ...spec.elements };
  let nextY = canvasMargin;

  for (const row of rows) {
    const rowTop = Math.min(...row.map((item) => item.layout.y));
    const rowHeight = Math.max(...row.map((item) => item.layout.h));

    for (const item of row) {
      const element = spec.elements[item.elementId];
      const layout = getElementLayout(element);

      if (!element || !layout) {
        continue;
      }

      nextElements[item.elementId] = {
        ...element,
        props: {
          ...element.props,
          layout: {
            ...layout,
            y: Math.round(nextY + Math.max(0, layout.y - rowTop)),
          },
        },
      };
    }

    nextY += rowHeight + componentGap;
  }

  return nextElements;
}

function groupElementRows(spec: JsonRenderSpec): Array<Array<{ elementId: string; layout: LayoutRect }>> {
  const items = getRootChildren(spec)
    .map((elementId) => {
      const layout = getElementLayout(spec.elements[elementId]);
      return layout ? { elementId, layout } : null;
    })
    .filter((item): item is { elementId: string; layout: LayoutRect } => Boolean(item))
    .toSorted((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
  const rows: Array<Array<{ elementId: string; layout: LayoutRect }>> = [];

  for (const item of items) {
    const row = rows.find((currentRow) => {
      const rowTop = Math.min(...currentRow.map((rowItem) => rowItem.layout.y));
      const rowBottom = Math.max(
        ...currentRow.map((rowItem) => rowItem.layout.y + rowItem.layout.h),
      );
      const itemMid = item.layout.y + item.layout.h / 2;

      return itemMid >= rowTop && itemMid <= rowBottom;
    });

    if (row) {
      row.push(item);
      continue;
    }

    rows.push([item]);
  }

  return rows.map((row) => row.toSorted((a, b) => a.layout.x - b.layout.x));
}

function getColumnWidth(canvasWidth: number, margin: number, gap: number): number {
  const contentWidth = Math.max(0, canvasWidth - margin * 2);
  return (contentWidth - gap * (DEFAULT_LAYOUT_COLUMNS - 1)) / DEFAULT_LAYOUT_COLUMNS;
}

function getSpanWidth(columns: number, columnWidth: number, gap: number): number {
  return Math.round(columnWidth * columns + gap * Math.max(0, columns - 1));
}

function getNearestColumnSpan(
  width: number,
  canvasWidth: number,
  margin: number,
  gap: number,
): number {
  const columnWidth = getColumnWidth(canvasWidth, margin, gap);
  const columnUnit = columnWidth + gap;
  const span = Math.round((width + gap) / columnUnit);

  return Math.max(1, Math.min(DEFAULT_LAYOUT_COLUMNS, span));
}

function getNearestColumnX(
  x: number,
  options: {
    canvasMargin: number;
    columnWidth: number;
    componentGap: number;
  },
): number {
  const { canvasMargin, columnWidth, componentGap } = options;
  const columnUnit = columnWidth + componentGap;
  const columnIndex = Math.max(
    0,
    Math.min(DEFAULT_LAYOUT_COLUMNS - 1, Math.round((x - canvasMargin) / columnUnit)),
  );

  return Math.round(canvasMargin + columnIndex * columnUnit);
}

function getPlacedLayouts(spec: JsonRenderSpec, ignoredElementId?: string): LayoutRect[] {
  return Object.entries(spec.elements)
    .filter(([elementId]) => elementId !== spec.root && elementId !== ignoredElementId)
    .map(([, element]) => getElementLayout(element))
    .filter((layout): layout is LayoutRect => Boolean(layout));
}

function resolveLayoutCollision(
  layout: LayoutRect,
  placedLayouts: LayoutRect[],
  options: {
    canvasHeight: number;
    canvasMargin: number;
    canvasWidth: number;
    componentGap: number;
    gridSize: number;
  },
): LayoutRect {
  const { canvasHeight, canvasMargin, canvasWidth, componentGap, gridSize } = options;
  let candidate = clampLayout(layout, canvasWidth, canvasHeight, canvasMargin);
  const maxAttempts = 200;

  for (let index = 0; index < maxAttempts; index += 1) {
    const collision = placedLayouts.find((item) => rectsOverlap(candidate, item, componentGap));

    if (!collision) {
      return candidate;
    }

    candidate = clampLayout(
      {
        ...candidate,
        y: snapToGrid(collision.y + collision.h + componentGap, gridSize),
      },
      canvasWidth,
      canvasHeight,
      canvasMargin,
    );
  }

  return candidate;
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function createElementId(type: string, elements: JsonRenderSpec["elements"]): string {
  const base = type.replaceAll(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  let index = Object.keys(elements).length + 1;
  let id = `${base}-${index}`;

  while (elements[id]) {
    index += 1;
    id = `${base}-${index}`;
  }

  return id;
}

function createEmptyBinding({
  component,
  datasetId,
  elementId,
}: {
  component: EditorComponent;
  datasetId: string;
  elementId: string;
}) {
  if (component.queryType === "none") {
    return null;
  }

  return {
    aggregation: "sum",
    datasetId,
    display: {
      format: null,
      showComparison: false,
    },
    fields: createDefaultBindingFields(component.queryType),
    granularity: component.queryType === "trend" ? "month" : null,
    limit: component.queryType === "metric" ? 1 : 10,
    queryType: component.queryType,
    sort: null,
    widgetId: elementId,
  };
}

function createDefaultBindingFields(queryType: EditorComponent["queryType"]) {
  if (queryType === "trend") {
    return {
      measure: null,
      measures: [],
      time: null,
    };
  }

  if (queryType === "breakdown") {
    return {
      dimension: null,
      measure: null,
      measures: [],
    };
  }

  if (queryType === "table") {
    return {
      columns: [],
    };
  }

  if (queryType === "metric") {
    return {
      measure: null,
      measures: [],
    };
  }

  return {};
}

function createDefaultPreviewResult(component: EditorComponent): WidgetResult {
  const points = [
    { x: "一月", y: 32 },
    { x: "二月", y: 48 },
    { x: "三月", y: 36 },
    { x: "四月", y: 64 },
    { x: "五月", y: 52 },
    { x: "六月", y: 78 },
  ];
  const breakdownItems = [
    { label: "类别一", value: 128 },
    { label: "类别二", value: 96 },
    { label: "类别三", value: 72 },
    { label: "类别四", value: 54 },
  ];

  if (component.queryType === "metric") {
    return {
      changeRate: null,
      changeValue: null,
      compareValue: null,
      type: "metric",
      value: 1280,
    };
  }

  if (component.type === "MultiLineChart") {
    return {
      items: points.map((point, index) => ({
        x: point.x,
        指标一: point.y ?? 0,
        指标二: [24, 36, 44, 50, 42, 68][index],
      })),
      points,
      series: ["指标一", "指标二"],
      type: "trend",
    };
  }

  if (component.queryType === "trend") {
    return {
      points,
      type: "trend",
    };
  }

  if (component.type === "MultiBarChart") {
    return {
      items: breakdownItems.map((item, index) => ({
        label: item.label,
        指标一: item.value,
        指标二: [88, 72, 56, 42][index],
      })),
      series: ["指标一", "指标二"],
      type: "breakdown",
    };
  }

  if (component.queryType === "breakdown") {
    return {
      items: breakdownItems,
      type: "breakdown",
    };
  }

  if (component.queryType === "table") {
    return {
      columns: ["字段一", "字段二", "字段三"],
      rows: [
        { 字段一: "A001", 字段二: "示例数据", 字段三: 128 },
        { 字段一: "A002", 字段二: "示例数据", 字段三: 96 },
        { 字段一: "A003", 字段二: "示例数据", 字段三: 72 },
      ],
      type: "table",
    };
  }

  return {
    changeRate: null,
    changeValue: null,
    compareValue: null,
    type: "metric",
    value: null,
  };
}

function clampLayout(
  layout: LayoutRect,
  canvasWidth: number,
  canvasHeight: number,
  margin = 0,
): LayoutRect {
  const width = Math.min(layout.w, Math.max(0, canvasWidth - margin * 2));
  const height = Math.min(layout.h, Math.max(0, canvasHeight - margin * 2));

  return {
    h: height,
    w: width,
    x: Math.min(Math.max(margin, layout.x), Math.max(margin, canvasWidth - margin - width)),
    y: Math.min(Math.max(margin, layout.y), Math.max(margin, canvasHeight - margin - height)),
  };
}

function snapToGrid(value: number, size = 8): number {
  return Math.round(value / size) * size;
}

function Ruler({
  canvasHeight,
  canvasWidth,
  orientation,
  overflow,
  scrollOffset,
  zoom,
}: {
  canvasHeight: number;
  canvasWidth: number;
  orientation: "horizontal" | "vertical";
  overflow: number;
  scrollOffset: number;
  zoom: number;
}) {
  const scale = zoom / 100;
  const rulerScrollPos = (scrollOffset - overflow) / scale;
  const rulerTheme = {
    backgroundColor: "#1b1f25",
    lineColor: "#4b5563",
    textColor: "#8f98a8",
  };

  if (orientation === "vertical") {
    return (
      <div
        className="sticky left-0 z-20 h-0"
        style={{ top: RULER_SIZE, width: RULER_SIZE }}
      >
        <div className="border-r border-white/10 bg-[#1b1f25]">
          <ScenaRuler
            {...rulerTheme}
            height={(canvasHeight + overflow * 4) * scale}
            negativeRuler
            scrollPos={rulerScrollPos}
            segment={10}
            textAlign="right"
            textOffset={[0, -4]}
            type="vertical"
            unit={100}
            width={RULER_SIZE}
            zoom={scale}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-20 h-0">
      <div
        className="border-b border-white/10 bg-[#1b1f25]"
        style={{
          height: RULER_SIZE,
          marginLeft: RULER_SIZE,
          width: Math.max((canvasWidth + overflow) * scale + 480, 1600),
        }}
      >
        <ScenaRuler
          {...rulerTheme}
          height={RULER_SIZE}
          negativeRuler
          scrollPos={rulerScrollPos}
          segment={10}
          textOffset={[0, 0]}
          type="horizontal"
          unit={100}
          width={Math.max((canvasWidth + overflow) * scale + 480, 1600)}
          zoom={scale}
        />
      </div>
    </div>
  );
}
