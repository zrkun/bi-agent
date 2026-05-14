"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BezierEdge,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  BarChart3,
  Clock3,
  Database,
  FileSpreadsheet,
  Hash,
  Info,
  MousePointer2,
  Plus,
  RefreshCw,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type FieldType = "date" | "number" | "text";
type SemanticType = "dimension" | "measure" | "time";
type Aggregation = "sum" | "avg" | "count" | "max" | "min" | "none";
type CreateStep = "fields" | "model";
type FieldView = "detail" | "preview";
type FormulaOperator = "+" | "-" | "*" | "/";

type LocalFileRecord = {
  display_name: string;
  id: string;
  sheet_name: string;
};

type DatabaseTableRecord = {
  id: string;
  name: string;
  schema: string;
};

type DatasourceRecord = {
  id: string;
  name: string;
  type: string;
};

type LocalFileField = {
  display_name?: string | null;
  name?: string | null;
  source_name?: string | null;
  type: FieldType | string;
};

type LocalFileDetail = LocalFileRecord & {
  fields: LocalFileField[];
};

type DatasourcePreviewField = {
  name: string;
  type: string;
};

type DatasetPreviewRow = Record<string, string>;

type CalculatedFieldExpression = {
  leftFieldKey: string;
  operator: FormulaOperator;
  rightFieldKey: string;
};

type DatasetDetailField = {
  aggregation?: string | null;
  config?: {
    expression?: CalculatedFieldExpression | null;
    field_kind?: "calculated" | "source";
  };
  data_type: string;
  display_name: string;
  selected: boolean;
  semantic_type: SemanticType;
  source_name: string;
};

type DatasetDetailResponse = {
  item: null | {
    datasource_id: string;
    fields: DatasetDetailField[];
    id: string;
    name: string;
    relationships: Array<{
      conditions: Array<{
        left_field: string;
        operator: "=" | "!=" | "<" | "<=" | ">" | ">=";
        right_field: string;
      }>;
      join_type: "full" | "inner" | "left" | "right";
      left_table: string;
      right_table: string;
    }>;
    source_tables: string[];
    source_type: string;
  };
};

type EditableDatasetField = {
  aggregation: Aggregation;
  dataType: FieldType;
  displayName: string;
  expression?: CalculatedFieldExpression;
  fieldKind?: "calculated" | "source";
  id: string;
  selected: boolean;
  semanticType: SemanticType;
  sourceName: string;
};

type ModelTable = {
  fields: EditableDatasetField[];
  id: string;
  label: string;
  schema?: string | null;
  slotId?: string;
};

type FieldReferenceOption = {
  fieldId: string;
  fieldKey: string;
  label: string;
  tableId: string;
  tableLabel: string;
};

type ModelRelationship = {
  conditions: RelationshipCondition[];
  id: string;
  joinType: "full" | "inner" | "left" | "right";
  leftTableId: string;
  rightTableId: string;
};

type RelationshipCondition = {
  id: string;
  leftField: string;
  operator: "=" | "!=" | "<" | "<=" | ">" | ">=";
  rightField: string;
};

type FlowTableNodeData = {
  fieldCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
  label: string;
  removable: boolean;
  onRemove: (tableId: string) => void;
  tableId: string;
};

type FlowSlotNodeData = {
  onDropTable: (event: DragEvent<HTMLDivElement>, slotId: string) => void;
  slotId: string;
};

type FlowNode = Node<FlowSlotNodeData | FlowTableNodeData>;
type FlowTableNode = Node<FlowTableNodeData, "table">;
type FlowSlotNode = Node<FlowSlotNodeData, "slot">;

type CanvasSlot = {
  id: string;
  parentId?: string;
  x: number;
  y: number;
};

type InspectorSelection =
  | {
      id: string;
      type: "relationship";
    }
  | {
      id: string;
      type: "table";
    };

const canvasSlots: CanvasSlot[] = [
  { id: "root", x: 56, y: 96 },
  { id: "child-1", parentId: "root", x: 360, y: 96 },
  { id: "child-2", parentId: "root", x: 360, y: 192 },
  { id: "child-3", parentId: "root", x: 360, y: 288 },
  { id: "grandchild-1", parentId: "child-1", x: 680, y: 96 },
  { id: "grandchild-2", parentId: "child-2", x: 680, y: 192 },
];

export default function CreateDatasetPage() {
  return (
    <Suspense fallback={null}>
      <CreateDatasetContent />
    </Suspense>
  );
}

function CreateDatasetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDatasourceId = searchParams.get("datasourceId") ?? "";
  const editingDatasetId = searchParams.get("datasetId");
  const [datasetName, setDatasetName] = useState("未命名");
  const [datasources, setDatasources] = useState<DatasourceRecord[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFileRecord[]>([]);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTableRecord[]>([]);
  const [modelTables, setModelTables] = useState<ModelTable[]>([]);
  const [calculatedFields, setCalculatedFields] = useState<EditableDatasetField[]>([]);
  const [relationships, setRelationships] = useState<ModelRelationship[]>([]);
  const [selectedDatasourceId, setSelectedDatasourceId] = useState(initialDatasourceId);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection | null>(null);
  const [canvasAreaRatio, setCanvasAreaRatio] = useState(50);
  const [draggingTable, setDraggingTable] = useState(false);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [step, setStep] = useState<CreateStep>("model");
  const [fieldView, setFieldView] = useState<FieldView>("detail");
  const [selectedFieldTableId, setSelectedFieldTableId] = useState("");
  const [previewRows, setPreviewRows] = useState<DatasetPreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [hydratingDataset, setHydratingDataset] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const tableOptions =
    selectedDatasourceId === "local-file"
      ? localFiles.map((item) => ({ id: item.id, label: item.display_name }))
      : databaseTables.map((item) => ({ id: item.id, label: item.name }));
  const sidebarTableOptions =
    step === "fields"
      ? modelTables.map((table) => ({ id: table.id, label: table.label }))
      : tableOptions;
  const allFields = [...modelTables.flatMap((table) => table.fields), ...calculatedFields];
  const selectedFieldCount = allFields.filter((field) => field.selected).length;
  const canProceed = Boolean(
    modelTables.length > 0 &&
    datasetName.trim() &&
    selectedFieldCount > 0 &&
    (modelTables.length === 1 || relationships.length > 0) &&
    !hydratingDataset &&
    !saving,
  );
  const selectedInspectorTable =
    inspectorSelection?.type === "table"
      ? modelTables.find((table) => table.id === inspectorSelection.id)
      : null;
  const selectedInspectorRelationship =
    inspectorSelection?.type === "relationship"
      ? relationships.find((relationship) => relationship.id === inspectorSelection.id)
      : null;
  const nodeTypes = useMemo(() => ({ slot: SlotFlowNode, table: TableFlowNode }), []);
  const edgeTypes = useMemo(() => ({ soft: BezierEdge }), []);
  const fieldReferenceOptions = useMemo<FieldReferenceOption[]>(
    () =>
      modelTables.flatMap((table) =>
        table.fields.map((field) => ({
          fieldId: field.id,
          fieldKey: buildFieldKey(table.id, field.id),
          label: field.displayName,
          tableId: table.id,
          tableLabel: table.label,
        })),
      ),
    [modelTables],
  );
  const occupiedSlotIds = useMemo(
    () => new Set(modelTables.map((table) => table.slotId).filter(Boolean)),
    [modelTables],
  );
  const availableSlots = useMemo(
    () => getAvailableSlots(modelTables).filter((slot) => !occupiedSlotIds.has(slot.id)),
    [modelTables, occupiedSlotIds],
  );
  const flowNodes = useMemo<FlowNode[]>(() => {
    const tableNodes: FlowTableNode[] = modelTables.map((table, index) => ({
      data: {
        fieldCount: table.fields.filter((field) => field.selected).length,
        hasNext:
          relationships.some((relationship) => relationship.leftTableId === table.id) ||
          (draggingTable &&
            availableSlots.some((slot) => {
              const parentTable = getParentTableForSlot(modelTables, slot.id);

              return parentTable?.id === table.id;
            })),
        hasPrevious: relationships.some((relationship) => relationship.rightTableId === table.id),
        label: `${table.label} · 字段 ${table.fields.filter((field) => field.selected).length}`,
        removable: !relationships.some((relationship) => relationship.leftTableId === table.id),
        onRemove: removeModelTable,
        tableId: table.id,
      },
      id: table.id,
      height: 42,
      initialHeight: 42,
      initialWidth: 180,
      measured: {
        height: 42,
        width: 180,
      },
      position: getSlotPosition(table.slotId, index, modelTables.length),
      selected: inspectorSelection?.type === "table" && inspectorSelection.id === table.id,
      style: {
        background: "#ffffff",
        border:
          inspectorSelection?.type === "table" && inspectorSelection.id === table.id
            ? "1px solid hsl(var(--primary))"
            : "1px solid hsl(var(--border))",
        borderRadius: 8,
        boxShadow:
          inspectorSelection?.type === "table" && inspectorSelection.id === table.id
            ? "0 10px 30px rgba(37, 99, 235, 0.14)"
            : "0 8px 22px rgba(15, 23, 42, 0.08)",
        color: "hsl(var(--foreground))",
        minWidth: 180,
        padding: 0,
      },
      type: "table",
      width: 180,
    }));
    const slotNodes: FlowSlotNode[] = draggingTable
      ? availableSlots.map((slot) => ({
          data: {
            onDropTable: dropTableToSlot,
            slotId: slot.id,
          },
          draggable: false,
          height: 42,
          id: `slot-${slot.id}`,
          initialHeight: 42,
          initialWidth: 180,
          measured: {
            height: 42,
            width: 180,
          },
          position: { x: slot.x, y: slot.y },
          selectable: false,
          type: "slot",
          width: 180,
        }))
      : [];

    return [...tableNodes, ...slotNodes];
  }, [availableSlots, draggingTable, inspectorSelection, modelTables, relationships]);
  const flowEdges = useMemo<Edge[]>(() => {
    const relationshipEdges: Edge[] = relationships.map((relationship) => ({
      animated: true,
      id: relationship.id,
      label: draggingTable ? undefined : getJoinTypeLabel(relationship.joinType),
      labelBgBorderRadius: 12,
      labelBgPadding: [6, 3],
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 1,
        stroke:
          inspectorSelection?.type === "relationship" && inspectorSelection.id === relationship.id
            ? "hsl(var(--primary))"
            : "#e2e8f0",
        strokeWidth:
          inspectorSelection?.type === "relationship" && inspectorSelection.id === relationship.id
            ? 1.5
            : 1,
      },
      labelStyle: {
        fill: "hsl(var(--foreground))",
        fontSize: 12,
        fontWeight: 600,
      },
      markerEnd: { color: "#64748b", type: MarkerType.ArrowClosed },
      selected:
        inspectorSelection?.type === "relationship" && inspectorSelection.id === relationship.id,
      source: relationship.leftTableId,
      style: {
        stroke: "#64748b",
        strokeDasharray: "6 6",
        strokeLinecap: "round",
        strokeWidth: 1.8,
      },
      target: relationship.rightTableId,
      type: "soft",
    }));
    const previewEdges: Edge[] = draggingTable
      ? availableSlots.reduce<Edge[]>((edges, slot) => {
          const parentTable = getParentTableForSlot(modelTables, slot.id);

          if (!parentTable) {
            return edges;
          }

          edges.push({
            animated: true,
            id: `preview-${slot.id}`,
            interactionWidth: 16,
            source: parentTable.id,
            style: {
              stroke: "#93c5fd",
              strokeDasharray: "6 6",
              strokeLinecap: "round",
              strokeWidth: 1.5,
            },
            target: `slot-${slot.id}`,
            type: "soft",
            zIndex: 20,
          });

          return edges;
        }, [])
      : [];

    return [...relationshipEdges, ...previewEdges];
  }, [availableSlots, draggingTable, inspectorSelection, modelTables, relationships]);

  useEffect(() => {
    let isMounted = true;

    async function loadSources() {
      try {
        const [datasourceResponse, localFileResponse] = await Promise.all([
          fetch("/api/datasources", { cache: "no-store" }),
          fetch("/api/local-files", { cache: "no-store" }),
        ]);
        const datasourceData = (await datasourceResponse.json()) as { items?: DatasourceRecord[] };
        const localFileData = (await localFileResponse.json()) as { items?: LocalFileRecord[] };

        if (!isMounted) {
          return;
        }

        const items = localFileData.items ?? [];
        const nextDatasources = datasourceData.items ?? [];
        setDatasources(nextDatasources);
        setLocalFiles(items);
        setSelectedDatasourceId((currentDatasourceId) => {
          if (currentDatasourceId) {
            return currentDatasourceId;
          }

          return nextDatasources[0]?.id ?? "";
        });
      } catch {
        if (isMounted) {
          setMessage("数据源加载失败。");
        }
      } finally {
        if (isMounted) {
          setLoadingTables(false);
        }
      }
    }

    loadSources();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrateDatasetForEdit() {
      if (!editingDatasetId) {
        return;
      }

      setHydratingDataset(true);
      setMessage("");

      try {
        const detailResponse = await fetch(
          `/api/datasets/${encodeURIComponent(editingDatasetId)}`,
          {
            cache: "no-store",
          },
        );
        const detailData = (await detailResponse.json()) as DatasetDetailResponse;
        const datasetDetail = detailData.item;

        if (!isMounted || !datasetDetail) {
          return;
        }

        const tableIds = datasetDetail.source_tables;
        const tablePayloads = await Promise.all(
          tableIds.map(async (tableId) => {
            const response =
              datasetDetail.datasource_id === "local-file"
                ? await fetch(`/api/local-files/${encodeURIComponent(tableId)}`, {
                    cache: "no-store",
                  })
                : await fetch(
                    `/api/datasources/${encodeURIComponent(datasetDetail.datasource_id)}/tables/${encodeURIComponent(tableId)}/preview`,
                    { cache: "no-store" },
                  );

            return {
              data: await response.json(),
              tableId,
            };
          }),
        );

        if (!isMounted) {
          return;
        }

        const nextModelTables = tableIds.reduce<ModelTable[]>((tables, tableId, index) => {
          const payload = tablePayloads.find((item) => item.tableId === tableId);
          const detailFields = datasetDetail.fields.filter(
            (field) =>
              (field.config?.field_kind || "source") !== "calculated" &&
              matchDatasetFieldToTable(tableId, field.source_name),
          );

          if (!payload) {
            return tables;
          }

          if (datasetDetail.datasource_id === "local-file") {
            const localItem = (payload.data as { item?: LocalFileDetail | null }).item;

            if (!localItem) {
              return tables;
            }

            tables.push({
              fields: mergeEditableFields(
                normalizeFields(localItem.fields, localItem.display_name),
                detailFields,
                tableId,
              ),
              id: localItem.id,
              label: localItem.display_name,
              schema: "本地文件",
              slotId: canvasSlots[index]?.id,
            });

            return tables;
          }

          const datasourceFields = normalizeDatasourceFields(
            (payload.data as { fields?: DatasourcePreviewField[] }).fields ?? [],
            getTableNameFromId(tableId),
          );

          tables.push({
            fields: mergeEditableFields(datasourceFields, detailFields, tableId),
            id: tableId,
            label: getTableNameFromId(tableId),
            schema: getSchemaNameFromId(tableId),
            slotId: canvasSlots[index]?.id,
          });

          return tables;
        }, []);

        const nextCalculatedFields = datasetDetail.fields
          .filter((field) => (field.config?.field_kind || "source") === "calculated")
          .map((field, index) => ({
            aggregation: (field.aggregation as Aggregation | null) || "sum",
            dataType: normalizeFieldType(field.data_type),
            displayName: field.display_name,
            expression: field.config?.expression ?? undefined,
            fieldKind: "calculated" as const,
            id: `calc-edit-${index}`,
            selected: field.selected,
            semanticType: field.semantic_type,
            sourceName: field.source_name,
          }));

        setSelectedDatasourceId(datasetDetail.datasource_id);
        setDatasetName(datasetDetail.name);
        setModelTables(nextModelTables);
        setCalculatedFields(nextCalculatedFields);
        setRelationships(
          datasetDetail.relationships.map((relationship, index) => ({
            conditions: relationship.conditions.map((condition, conditionIndex) => ({
              id: `cond-edit-${index}-${conditionIndex}`,
              leftField: condition.left_field,
              operator: condition.operator,
              rightField: condition.right_field,
            })),
            id: `rel-edit-${index}`,
            joinType: relationship.join_type,
            leftTableId: relationship.left_table,
            rightTableId: relationship.right_table,
          })),
        );
        setSelectedFieldTableId(tableIds[0] ?? "");
        setInspectorSelection(null);
        setSelectedTableId("");
      } catch {
        if (isMounted) {
          setMessage("数据集详情加载失败。");
        }
      } finally {
        if (isMounted) {
          setHydratingDataset(false);
        }
      }
    }

    hydrateDatasetForEdit();

    return () => {
      isMounted = false;
    };
  }, [editingDatasetId]);

  useEffect(() => {
    let isMounted = true;

    async function loadDatabaseTables() {
      if (selectedDatasourceId === "local-file") {
        setDatabaseTables([]);
        return;
      }

      if (!selectedDatasourceId) {
        setDatabaseTables([]);
        setLoadingTables(false);
        return;
      }

      setLoadingTables(true);
      setDatabaseTables([]);

      try {
        const response = await fetch(
          `/api/datasources/${encodeURIComponent(selectedDatasourceId)}/tables`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as { items?: DatabaseTableRecord[] };

        if (!isMounted) {
          return;
        }

        const items = data.items ?? [];
        setDatabaseTables(items);
      } catch {
        if (isMounted) {
          setMessage("数据库表加载失败。");
        }
      } finally {
        if (isMounted) {
          setLoadingTables(false);
        }
      }
    }

    loadDatabaseTables();

    return () => {
      isMounted = false;
    };
  }, [selectedDatasourceId]);

  useEffect(() => {
    let isMounted = true;

    async function loadTableDetail() {
      if (!selectedTableId) {
        return;
      }

      setLoadingFields(true);
      setMessage("");

      try {
        const response =
          selectedDatasourceId === "local-file"
            ? await fetch(`/api/local-files/${encodeURIComponent(selectedTableId)}`, {
                cache: "no-store",
              })
            : await fetch(
                `/api/datasources/${encodeURIComponent(selectedDatasourceId)}/tables/${encodeURIComponent(selectedTableId)}/preview`,
                { cache: "no-store" },
              );

        if (!isMounted) {
          return;
        }

        if (selectedDatasourceId === "local-file") {
          const data = (await response.json()) as { item?: LocalFileDetail | null };

          if (!response.ok || !data.item) {
            setModelTables((currentTables) =>
              currentTables.filter((table) => table.id !== selectedTableId),
            );
            setMessage("数据表不存在。");
            return;
          }

          upsertModelTable({
            fields: normalizeFields(data.item.fields, data.item.display_name),
            id: data.item.id,
            label: data.item.display_name,
            schema: "本地文件",
          });
        } else {
          const data = (await response.json()) as { fields?: DatasourcePreviewField[] };
          const table = databaseTables.find((item) => item.id === selectedTableId);

          if (!table) {
            return;
          }

          upsertModelTable({
            fields: normalizeDatasourceFields(data.fields ?? [], table.name),
            id: table.id,
            label: table.name,
            schema: table.schema,
          });
        }
      } catch {
        if (isMounted) {
          setMessage("字段加载失败。");
        }
      } finally {
        if (isMounted) {
          setLoadingFields(false);
        }
      }
    }

    loadTableDetail();

    return () => {
      isMounted = false;
    };
  }, [databaseTables, selectedDatasourceId, selectedTableId]);

  function changeDatasource(datasourceId: string) {
    if (modelTables.length > 0 && datasourceId !== selectedDatasourceId) {
      return;
    }

    setSelectedDatasourceId(datasourceId);
    setSelectedTableId("");
    setDatasetName("未命名");
    setModelTables([]);
    setCalculatedFields([]);
    setRelationships([]);
    setInspectorSelection(null);
    setPendingSlotId(null);
    setDraggingTable(false);
    setStep("model");
    setMessage("");
  }

  function upsertModelTable(table: ModelTable) {
    const baseTable = modelTables[0];
    const tableExists = modelTables.some((currentTable) => currentTable.id === table.id);
    const nextSlotId = tableExists
      ? modelTables.find((currentTable) => currentTable.id === table.id)?.slotId
      : getNextSlotId(modelTables, pendingSlotId);

    if (!tableExists && !nextSlotId) {
      setMessage("请拖拽到画布中的预置位置添加数据表。");
      setSelectedTableId("");
      setPendingSlotId(null);
      setDraggingTable(false);
      return;
    }

    const tableWithSlot = { ...table, slotId: nextSlotId };

    setModelTables((currentTables) =>
      currentTables.some((currentTable) => currentTable.id === table.id)
        ? currentTables.map((currentTable) =>
            currentTable.id === table.id ? { ...table, slotId: currentTable.slotId } : currentTable,
          )
        : [...currentTables, tableWithSlot],
    );

    if (!tableExists && baseTable && baseTable.id !== table.id) {
      const parentTable = getParentTableForSlot(modelTables, nextSlotId) ?? baseTable;
      addRelationshipBetween(parentTable, tableWithSlot, false);
    }

    setInspectorSelection({ id: table.id, type: "table" });
    setPendingSlotId(null);
    setDraggingTable(false);
  }

  function updateField(tableId: string, fieldId: string, patch: Partial<EditableDatasetField>) {
    setModelTables((currentTables) =>
      currentTables.map((table) =>
        table.id === tableId
          ? {
              ...table,
              fields: table.fields.map((field) =>
                field.id === fieldId ? { ...field, ...patch } : field,
              ),
            }
          : table,
      ),
    );
  }

  function addCalculatedField(field: EditableDatasetField) {
    setCalculatedFields((currentFields) => [...currentFields, field]);

    if (field.expression) {
      const dependentKeys = new Set([
        field.expression.leftFieldKey,
        field.expression.rightFieldKey,
      ]);

      setModelTables((currentTables) =>
        currentTables.map((table) => ({
          ...table,
          fields: table.fields.map((currentField) =>
            dependentKeys.has(buildFieldKey(table.id, currentField.id))
              ? { ...currentField, selected: true }
              : currentField,
          ),
        })),
      );
    }
  }

  function updateCalculatedField(fieldId: string, patch: Partial<EditableDatasetField>) {
    setCalculatedFields((currentFields) =>
      currentFields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    );
  }

  function removeCalculatedField(fieldId: string) {
    setCalculatedFields((currentFields) => currentFields.filter((field) => field.id !== fieldId));
  }

  function updateTableFields(tableId: string, selected: boolean) {
    setModelTables((currentTables) =>
      currentTables.map((table) =>
        table.id === tableId
          ? { ...table, fields: table.fields.map((field) => ({ ...field, selected })) }
          : table,
      ),
    );
  }

  function removeModelTable(tableId: string) {
    if (relationships.some((relationship) => relationship.leftTableId === tableId)) {
      return;
    }

    setModelTables((currentTables) => currentTables.filter((table) => table.id !== tableId));
    setRelationships((currentRelationships) =>
      currentRelationships.filter(
        (relationship) =>
          relationship.leftTableId !== tableId && relationship.rightTableId !== tableId,
      ),
    );
    setInspectorSelection((currentSelection) =>
      (currentSelection?.type === "table" && currentSelection.id === tableId) ||
      (currentSelection?.type === "relationship" &&
        relationships.some(
          (relationship) =>
            relationship.id === currentSelection.id &&
            (relationship.leftTableId === tableId || relationship.rightTableId === tableId),
        ))
        ? null
        : currentSelection,
    );
    setSelectedTableId((currentTableId) => (currentTableId === tableId ? "" : currentTableId));
    setStep("model");
  }

  function addRelationshipBetween(
    leftTable: ModelTable,
    rightTable: ModelTable,
    shouldSelectRelationship: boolean,
  ) {
    if (leftTable.id === rightTable.id) {
      setMessage("左右表不能相同。");
      return;
    }

    if (!canConnectAdjacentTables(leftTable, rightTable)) {
      setMessage("只能关联当前数据表的下一个相邻节点。");
      return;
    }

    const existingRelationship = relationships.find(
      (relationship) =>
        relationship.leftTableId === leftTable.id && relationship.rightTableId === rightTable.id,
    );

    if (existingRelationship) {
      if (shouldSelectRelationship) {
        setInspectorSelection({ id: existingRelationship.id, type: "relationship" });
      }
      return;
    }

    const relationshipId = `rel-${leftTable.id}-${rightTable.id}`;

    setRelationships((currentRelationships) =>
      currentRelationships.some((relationship) => relationship.id === relationshipId)
        ? currentRelationships
        : [
            ...currentRelationships,
            {
              conditions: [
                {
                  id: `cond-${Date.now()}`,
                  leftField: leftTable.fields[0]?.sourceName ?? "",
                  operator: "=",
                  rightField: rightTable.fields[0]?.sourceName ?? "",
                },
              ],
              id: relationshipId,
              joinType: "left",
              leftTableId: leftTable.id,
              rightTableId: rightTable.id,
            },
          ],
    );
    if (shouldSelectRelationship) {
      setInspectorSelection({ id: relationshipId, type: "relationship" });
    }
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    const leftTable = getModelTable(connection.source);
    const rightTable = getModelTable(connection.target);

    if (!leftTable || !rightTable) {
      return;
    }

    addRelationshipBetween(leftTable, rightTable, true);
  }

  function dropTableToCanvas(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const tableId = event.dataTransfer.getData("application/x-bi-table-id");

    if (!tableId || modelTables.some((table) => table.id === tableId)) {
      setDraggingTable(false);
      return;
    }

    const slotId = getNearestAvailableSlotId(event.currentTarget, event.clientX, event.clientY, availableSlots);

    if (!slotId) {
      setMessage("当前没有可用的预置位置。");
      setDraggingTable(false);
      return;
    }

    setPendingSlotId(slotId);
    setSelectedTableId(tableId);
    setDraggingTable(false);
  }

  function dropTableToSlot(event: DragEvent<HTMLDivElement>, slotId: string) {
    event.preventDefault();
    event.stopPropagation();

    const tableId = event.dataTransfer.getData("application/x-bi-table-id");

    if (
      !tableId ||
      occupiedSlotIds.has(slotId) ||
      modelTables.some((table) => table.id === tableId)
    ) {
      setDraggingTable(false);
      return;
    }

    setPendingSlotId(slotId);
    setSelectedTableId(tableId);
    setDraggingTable(false);
  }

  function addTableFromSidebarClick(tableId: string) {
    if (!tableId || modelTables.some((table) => table.id === tableId)) {
      return;
    }

    if (modelTables.length === 0) {
      setPendingSlotId("root");
      setSelectedTableId(tableId);
      return;
    }

    const mainTable = modelTables[0];
    const nextSlotId = mainTable ? getNextSlotIdForParent(modelTables, mainTable.id) : undefined;

    if (!nextSlotId) {
      setMessage("主表没有可用的关联位置，请拖拽到画布中的预置位置。");
      return;
    }

    setPendingSlotId(nextSlotId);
    setSelectedTableId(tableId);
  }

  function startResizeDetail(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();

    const resizeContainer = splitContainerRef.current;

    if (!resizeContainer) {
      return;
    }

    const activeContainer: HTMLDivElement = resizeContainer;

    function updateRatio(clientY: number, container: HTMLDivElement) {
      const rect = container.getBoundingClientRect();
      const nextRatio = ((clientY - rect.top) / rect.height) * 100;

      setCanvasAreaRatio(Math.min(75, Math.max(30, nextRatio)));
    }

    function handlePointerMove(pointerEvent: globalThis.PointerEvent) {
      updateRatio(pointerEvent.clientY, activeContainer);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    updateRatio(event.clientY, activeContainer);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function updateRelationship(relationshipId: string, patch: Partial<ModelRelationship>) {
    setRelationships((currentRelationships) =>
      currentRelationships.map((relationship) =>
        relationship.id === relationshipId ? { ...relationship, ...patch } : relationship,
      ),
    );
  }

  function removeRelationship(relationshipId: string) {
    setRelationships((currentRelationships) =>
      currentRelationships.filter((relationship) => relationship.id !== relationshipId),
    );
    setInspectorSelection((currentSelection) =>
      currentSelection?.type === "relationship" && currentSelection.id === relationshipId
        ? null
        : currentSelection,
    );
  }

  function getModelTable(tableId: string) {
    return modelTables.find((table) => table.id === tableId);
  }

  function validateDatasetModel() {
    const trimmedName = datasetName.trim();
    const selectedSourceFields = modelTables.flatMap((table) =>
      table.fields.filter((field) => field.selected).map((field) => ({ field, table })),
    );
    const selectedCalculatedFields = calculatedFields.filter((field) => field.selected);
    const sourceDisplayNameCount = selectedSourceFields.reduce<Record<string, number>>(
      (counts, item) => {
        const displayName = item.field.displayName.trim();

        if (displayName) {
          counts[displayName] = (counts[displayName] ?? 0) + 1;
        }

        return counts;
      },
      {},
    );
    const selectedFields = [
      ...selectedSourceFields.map(({ field, table }) => {
        const displayName = field.displayName.trim();

        return Object.assign({}, field, {
          displayName:
            modelTables.length > 1 && sourceDisplayNameCount[displayName] > 1
              ? `${table.label}.${displayName}`
              : displayName,
          sourceName: `${table.id}.${field.sourceName}`,
        });
      }),
      ...selectedCalculatedFields.map((field) =>
        Object.assign({}, field, {
          displayName: field.displayName.trim(),
        }),
      ),
    ];
    const fieldNames = selectedFields.map((field) => field.displayName);
    const duplicateFieldName = fieldNames.find(
      (fieldName, index) => fieldName && fieldNames.indexOf(fieldName) !== index,
    );

    if (modelTables.length === 0) {
      setMessage("请先选择数据表。");
      return null;
    }

    if (!trimmedName) {
      setMessage("数据集名称不能为空。");
      return null;
    }

    if (selectedFields.length === 0) {
      setMessage("请至少选择一个字段。");
      return null;
    }

    if (modelTables.length > 1 && relationships.length === 0) {
      setMessage("多表数据集请至少配置一条关联关系。");
      return null;
    }

    const invalidRelationship = relationships.find((relationship) => {
      const leftTable = getModelTable(relationship.leftTableId);
      const rightTable = getModelTable(relationship.rightTableId);
      const hasInvalidCondition = relationship.conditions.some(
        (condition) => !condition.leftField || !condition.rightField || !condition.operator,
      );

      return (
        !leftTable ||
        !rightTable ||
        leftTable.id === rightTable.id ||
        relationship.conditions.length === 0 ||
        hasInvalidCondition
      );
    });

    if (invalidRelationship) {
      setMessage("请补全关联关系，且左右表不能相同。");
      return null;
    }

    if (duplicateFieldName) {
      setMessage(`字段别名不能重复：${duplicateFieldName}。`);
      return null;
    }

    setMessage("");
    return { selectedFields, trimmedName };
  }

  function goToFieldStep() {
    if (!validateDatasetModel()) {
      return;
    }

    setSelectedFieldTableId((currentTableId) => currentTableId || modelTables[0]?.id || "");
    setStep("fields");
    setFieldView("detail");
  }

  async function saveDataset() {
    const validModel = validateDatasetModel();

    if (!validModel) {
      return;
    }

    const { selectedFields, trimmedName } = validModel;

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        editingDatasetId
          ? `/api/datasets/${encodeURIComponent(editingDatasetId)}`
          : "/api/datasets",
        {
          body: JSON.stringify({
            datasource_id: selectedDatasourceId,
            fields: selectedFields.map((field) => ({
              aggregation: field.aggregation === "none" ? null : field.aggregation,
              data_type: field.dataType,
              display_name: field.displayName.trim(),
              expression: field.expression,
              field_kind: field.fieldKind || "source",
              selected: true,
              semantic_type: field.semanticType,
              source_name: field.sourceName,
            })),
            name: trimmedName,
            relationships: relationships.map((relationship) => ({
              conditions: relationship.conditions.map((condition) => ({
                left_field: condition.leftField,
                operator: condition.operator,
                right_field: condition.rightField,
              })),
              join_type: relationship.joinType,
              left_table: relationship.leftTableId,
              right_table: relationship.rightTableId,
            })),
            source_tables: modelTables.map((table) => table.id),
            source_type: selectedDatasourceId === "local-file" ? "local-file" : "database",
          }),
          headers: { "Content-Type": "application/json" },
          method: editingDatasetId ? "PUT" : "POST",
        },
      );
      const data = (await response.json()) as {
        dataset?: { id: string } | null;
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !data.ok || !data.dataset?.id) {
        setMessage(data.message || "数据集创建失败。");
        return;
      }

      router.push("/datasets");
    } catch {
      setMessage("数据集创建失败：无法请求后端服务。");
    } finally {
      setSaving(false);
    }
  }

  async function refreshDatasetPreview() {
    const selectedSourceFields = modelTables.flatMap((table) =>
      table.fields.filter((field) => field.selected).map((field) => ({ field, table })),
    );
    const selectedCalculatedFields = calculatedFields.filter((field) => field.selected);
    const dependencyKeys = new Set(
      selectedCalculatedFields.flatMap((field) =>
        field.expression ? [field.expression.leftFieldKey, field.expression.rightFieldKey] : [],
      ),
    );
    const visibleFieldDisplayNameCount = [
      ...selectedSourceFields.map(({ field }) => ({
        displayName: field.displayName.trim(),
        tableLabel: "",
      })),
      ...selectedCalculatedFields.map((field) => ({
        displayName: field.displayName.trim(),
        tableLabel: "calculated_field",
      })),
    ].reduce<Record<string, number>>((counts, item) => {
      if (item.displayName) {
        counts[item.displayName] = (counts[item.displayName] ?? 0) + 1;
      }

      return counts;
    }, {});
    const requestFieldCandidates = [
      ...selectedSourceFields,
      ...modelTables.flatMap((table) =>
        table.fields
          .filter(
            (field) => !field.selected && dependencyKeys.has(buildFieldKey(table.id, field.id)),
          )
          .map((field) => ({ field, table })),
      ),
    ];
    const requestFields = requestFieldCandidates.reduce<
      Array<{ field: EditableDatasetField; table: ModelTable }>
    >((items, item) => {
      const nextKey = buildFieldKey(item.table.id, item.field.id);

      if (
        !items.some(
          (currentItem) => buildFieldKey(currentItem.table.id, currentItem.field.id) === nextKey,
        )
      ) {
        items.push(item);
      }

      return items;
    }, []);

    if (
      selectedDatasourceId === "local-file" ||
      (requestFields.length === 0 && selectedCalculatedFields.length === 0)
    ) {
      setPreviewRows([]);
      return;
    }

    setLoadingPreview(true);
    setMessage("");

    try {
      const response = await fetch("/api/datasets/preview", {
        body: JSON.stringify({
          datasource_id: selectedDatasourceId,
          fields: requestFields.map(({ field, table }) => ({
            data_type: field.dataType,
            display_name: buildPreviewSourceKey(table.id, field.id),
            selected: true,
            source_field: field.sourceName,
            source_table: table.id,
          })),
          relationships: relationships.map((relationship) => ({
            conditions: relationship.conditions.map((condition) => ({
              left_field: condition.leftField,
              operator: condition.operator,
              right_field: condition.rightField,
            })),
            join_type: relationship.joinType,
            left_table: relationship.leftTableId,
            right_table: relationship.rightTableId,
          })),
          tables: modelTables.map((table) => table.id),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { rows?: DatasetPreviewRow[] };
      const computedRows = (data.rows ?? []).map((row) => {
        const nextRow: DatasetPreviewRow = {};

        for (const { field, table } of selectedSourceFields) {
          const nextName =
            visibleFieldDisplayNameCount[field.displayName.trim()] > 1
              ? `${table.label}.${field.displayName}`
              : field.displayName;
          nextRow[nextName] = row[buildPreviewSourceKey(table.id, field.id)] ?? "";
        }

        for (const field of selectedCalculatedFields) {
          const nextName =
            visibleFieldDisplayNameCount[field.displayName.trim()] > 1
              ? `calculated_field.${field.displayName}`
              : field.displayName;

          if (!field.expression) {
            nextRow[nextName] = "";
            continue;
          }

          const leftValue = getPreviewNumericValue(row, field.expression.leftFieldKey);
          const rightValue = getPreviewNumericValue(row, field.expression.rightFieldKey);
          nextRow[nextName] = calculatePreviewValue(
            leftValue,
            field.expression.operator,
            rightValue,
          );
        }

        return nextRow;
      });

      setPreviewRows(computedRows);
    } catch {
      setPreviewRows([]);
      setMessage("数据预览加载失败。");
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <header className="flex h-14 shrink-0 items-center justify-between rounded-[24px] border border-white/70 bg-white/58 px-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild size="icon-sm" variant="ghost">
            <Link aria-label="返回数据集" href="/datasets">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <span className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
            <BarChart3 className="size-4" />
          </span>
          <Input
            className="h-8 w-56 border-0 bg-[#eef1f5] shadow-none focus-visible:ring-0"
            value={datasetName}
            onChange={(event) => setDatasetName(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {step === "fields" ? (
            <Button onClick={() => setStep("model")} type="button" variant="outline">
              上一步
            </Button>
          ) : null}
          <Button
            disabled={!canProceed}
            onClick={step === "model" ? goToFieldStep : saveDataset}
            type="button"
          >
            {hydratingDataset
              ? "加载中..."
              : step === "model"
                ? "下一步"
                : saving
                  ? "保存中..."
                  : "保存"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 pt-3 bg-transparent">
        {step === "fields" ? (
          <FieldStepSidebar
            calculatedFields={calculatedFields.filter((field) => field.selected)}
            selectedTableId={selectedFieldTableId || modelTables[0]?.id || ""}
            tables={modelTables}
            onSelectTable={setSelectedFieldTableId}
          />
        ) : (
          <aside className="flex w-64 shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white/52 backdrop-blur-sm">
            <div className="border-b border-white/70 px-4 py-3 text-sm font-semibold">模型配置</div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4">
              <div className="shrink-0">
                <div className="mb-3 text-xs text-muted-foreground">选择数据源</div>
                <Select value={selectedDatasourceId} onValueChange={changeDatasource}>
                  <SelectTrigger className="mb-4 w-full bg-[#f2f5ff]">
                    <Database className="size-4 text-primary" />
                    <SelectValue />
                  </SelectTrigger>
                  <FixedSelectContent>
                    {datasources.map((datasource) => (
                      <SelectItem
                        disabled={modelTables.length > 0 && selectedDatasourceId !== datasource.id}
                        key={datasource.id}
                        value={datasource.id}
                      >
                        {datasource.name}
                      </SelectItem>
                    ))}
                  </FixedSelectContent>
                </Select>
              </div>

              <div className="mb-2 flex shrink-0 items-center justify-between">
                <span className="text-sm font-medium">数据表</span>
                <span className="text-xs text-muted-foreground">
                  {selectedDatasourceId === "local-file"
                    ? localFiles.length
                    : databaseTables.length}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {loadingTables ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
                ) : sidebarTableOptions.length > 0 ? (
                  sidebarTableOptions.map((item) => {
                    const isAdded = modelTables.some((table) => table.id === item.id);

                    return (
                      <button
                        className={[
                          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                          isAdded
                            ? "cursor-not-allowed bg-primary/10 text-muted-foreground"
                            : selectedTableId === item.id
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-[#f6f8fb] hover:text-foreground",
                        ].join(" ")}
                        disabled={isAdded}
                        draggable={!isAdded}
                        key={item.id}
                        onClick={() => addTableFromSidebarClick(item.id)}
                        onDragEnd={() => setDraggingTable(false)}
                        onDragStart={(event) => {
                          startDragTable(event, item.id);
                          setDraggingTable(true);
                        }}
                        type="button"
                      >
                        <FileSpreadsheet className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg bg-[#f6f8fb] px-3 py-8 text-center text-sm text-muted-foreground">
                    暂无数据表
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[24px] border border-white/70 bg-white/52 shadow-[0_18px_44px_rgba(15,23,42,0.04)] backdrop-blur-sm">
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
            {message ? (
              <div className="mx-4 mt-4 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {message}
              </div>
            ) : null}

            {step === "fields" ? (
              <FieldArrangementStep
                calculatedFields={calculatedFields}
                fieldReferenceOptions={fieldReferenceOptions}
                fieldView={fieldView}
                loadingPreview={loadingPreview}
                previewRows={previewRows}
                tables={modelTables}
                onAddCalculatedField={addCalculatedField}
                onFieldViewChange={setFieldView}
                onRefreshPreview={refreshDatasetPreview}
                onRemoveCalculatedField={removeCalculatedField}
                onUpdateField={updateField}
                onUpdateCalculatedField={updateCalculatedField}
              />
            ) : (
              <div ref={splitContainerRef} className="relative flex min-h-0 flex-1 flex-col">
                <section
                  className="flex min-h-44 flex-col overflow-hidden bg-[#f7faff]"
                  style={{ flex: `${canvasAreaRatio} 1 0px` }}
                >
                  <div
                    className="relative min-h-0 flex-1 bg-[#edf3fb]"
                    onDragOver={allowDropTable}
                    onDrop={dropTableToCanvas}
                  >
                    <ReactFlow
                      className="h-full w-full"
                      edges={flowEdges}
                      edgeTypes={edgeTypes}
                      fitView
                      fitViewOptions={{ maxZoom: 0.82, padding: 0.32 }}
                      nodes={flowNodes}
                      nodeTypes={nodeTypes}
                      connectOnClick={false}
                      nodesConnectable
                      nodesDraggable={false}
                      onConnect={handleConnect}
                      onEdgeClick={(_, edge) =>
                        setInspectorSelection({ id: edge.id, type: "relationship" })
                      }
                      onNodeClick={(_, node) =>
                        setInspectorSelection({ id: node.id, type: "table" })
                      }
                      proOptions={{ hideAttribution: true }}
                    >
                      <Background color="#cbd5e1" gap={18} size={1} />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  </div>
                </section>

                <button
                  aria-label="调整详情区域大小"
                  className="group relative z-10 -my-2 flex h-4 shrink-0 cursor-row-resize items-center justify-center bg-transparent"
                  onPointerDown={startResizeDetail}
                  type="button"
                >
                  <span className="h-1 w-12 rounded-full bg-border transition-colors group-hover:bg-primary/40" />
                </button>

                <div
                  className="min-h-32 overflow-auto bg-white/52 p-4"
                  style={{ flex: `${100 - canvasAreaRatio} 1 0px` }}
                >
                  {loadingFields ? (
                    <div className="rounded-lg border border-border bg-white py-14 text-center text-sm text-muted-foreground">
                      加载中...
                    </div>
                  ) : null}
                  {selectedInspectorRelationship ? (
                    <RelationshipInspector
                      relationship={selectedInspectorRelationship}
                      tables={modelTables}
                      onFieldToggle={(tableId, fieldId, selected) =>
                        updateField(tableId, fieldId, { selected })
                      }
                      onRemove={removeRelationship}
                      onUpdate={updateRelationship}
                    />
                  ) : selectedInspectorTable ? (
                    (() => {
                      const table = selectedInspectorTable;
                      const tableSelectedFieldCount = table.fields.filter(
                        (field) => field.selected,
                      ).length;

                      return (
                        <section
                          className="overflow-hidden rounded-lg border border-border bg-white"
                          key={table.id}
                        >
                          <div className="flex items-center justify-between border-b border-border bg-[#f8fafc] px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                              <span className="truncate text-sm font-medium">{table.label}</span>
                              <span className="text-xs text-muted-foreground">
                                已选 {tableSelectedFieldCount} / {table.fields.length}
                              </span>
                            </div>
                            <Button
                              aria-label={`移除 ${table.label}`}
                              onClick={() => removeModelTable(table.id)}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc]">
                                <TableHead className="w-12 pl-4">
                                  <input
                                    aria-label={`选择 ${table.label} 全部字段`}
                                    checked={
                                      table.fields.length > 0 &&
                                      tableSelectedFieldCount === table.fields.length
                                    }
                                    className="size-4 accent-primary"
                                    onChange={(event) =>
                                      updateTableFields(table.id, event.target.checked)
                                    }
                                    type="checkbox"
                                  />
                                </TableHead>
                                <TableHead>源字段</TableHead>
                                <TableHead>
                                  <span className="inline-flex items-center gap-1.5">
                                    字段别名
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            aria-label="字段别名说明"
                                            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                            type="button"
                                          >
                                            <Info className="size-3.5" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          后续数据集、图表配置和智能体分析中展示的字段别名，可按业务语义修改。
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </span>
                                </TableHead>
                                <TableHead>字段类型</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {table.fields.length > 0 ? (
                                table.fields.map((field) => (
                                  <TableRow key={field.id}>
                                    <TableCell className="pl-4">
                                      <input
                                        aria-label={`选择字段 ${field.displayName}`}
                                        checked={field.selected}
                                        className="size-4 accent-primary"
                                        onChange={(event) =>
                                          updateField(table.id, field.id, {
                                            selected: event.target.checked,
                                          })
                                        }
                                        type="checkbox"
                                      />
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {field.sourceName}
                                    </TableCell>
                                    <TableCell className="text-foreground">
                                      {field.displayName}
                                    </TableCell>
                                    <TableCell>
                                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                        <FieldTypeIcon type={field.dataType} />
                                        {field.dataType}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <EmptyRow text="暂无可用字段" />
                              )}
                            </TableBody>
                          </Table>
                        </section>
                      );
                    })()
                  ) : (
                    <div className="flex h-full min-h-56 items-center justify-center">
                      <div className="flex min-h-64 w-full max-w-xl flex-col items-center justify-center text-center">
                        <div className="relative mb-5 h-24 w-28 text-primary/70">
                          <div className="absolute left-4 top-5 h-16 w-12 rounded-lg border border-primary/10 bg-primary/5 shadow-sm" />
                          <div className="absolute right-2 top-8 h-14 w-16 rounded-lg border border-primary/10 bg-white shadow-sm" />
                          <div className="absolute left-10 top-2 h-12 w-16 -rotate-6 rounded-md bg-primary/15" />
                          <MousePointer2 className="absolute bottom-3 left-7 size-7 fill-white text-primary" />
                          <span className="absolute right-7 top-8 size-2 rounded-full bg-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          请从左侧拖拽数据表，构建关系模型
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function FieldStepSidebar({
  calculatedFields,
  onSelectTable,
  selectedTableId,
  tables,
}: {
  calculatedFields: EditableDatasetField[];
  onSelectTable: (tableId: string) => void;
  selectedTableId: string;
  tables: ModelTable[];
}) {
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const selectedFields = (selectedTable?.fields ?? [])
    .filter((field) => field.selected)
    .map((field) =>
      Object.assign({}, field, {
        tableId: selectedTable?.id ?? "",
        tableLabel: selectedTable?.label ?? "",
      }),
    );
  const dimensionFields = selectedFields.filter((field) => field.semanticType !== "measure");
  const measureFields = selectedFields.filter((field) => field.semanticType === "measure");
  const calculatedOutlineFields = calculatedFields.map((field) =>
    Object.assign({}, field, {
      tableId: "calculated",
      tableLabel: "calculated_field",
    }),
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white/52 backdrop-blur-sm">
      <div className="flex h-12 items-center border-b border-white/70 px-4">
        <span className="text-sm font-semibold">表</span>
      </div>
      <div className="border-b border-white/70 p-3">
        <div className="space-y-1">
          {tables.map((table) => (
            <button
              className={cn(
                "flex h-10 w-full items-center rounded-md px-3 text-left text-sm transition-colors",
                table.id === selectedTable?.id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-[#f6f8fb]",
              )}
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              type="button"
            >
              <span className="truncate">{table.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 flex items-center">
          <span className="text-sm font-semibold">字段大纲</span>
        </div>
        <FieldOutlineGroup fields={dimensionFields} title={`维度 · ${dimensionFields.length}`} />
        <FieldOutlineGroup fields={measureFields} title={`度量 · ${measureFields.length}`} />
        <FieldOutlineGroup
          fields={calculatedOutlineFields}
          title={`计算字段 · ${calculatedOutlineFields.length}`}
        />
      </div>
    </aside>
  );
}

function FieldArrangementStep({
  calculatedFields,
  fieldReferenceOptions,
  fieldView,
  loadingPreview,
  onAddCalculatedField,
  onFieldViewChange,
  onRefreshPreview,
  onRemoveCalculatedField,
  onUpdateField,
  onUpdateCalculatedField,
  previewRows,
  tables,
}: {
  calculatedFields: EditableDatasetField[];
  fieldReferenceOptions: FieldReferenceOption[];
  fieldView: FieldView;
  loadingPreview: boolean;
  onAddCalculatedField: (field: EditableDatasetField) => void;
  onFieldViewChange: (view: FieldView) => void;
  onRefreshPreview: () => void;
  onRemoveCalculatedField: (fieldId: string) => void;
  onUpdateField: (tableId: string, fieldId: string, patch: Partial<EditableDatasetField>) => void;
  onUpdateCalculatedField: (fieldId: string, patch: Partial<EditableDatasetField>) => void;
  previewRows: DatasetPreviewRow[];
  tables: ModelTable[];
}) {
  const [showCalculatedForm, setShowCalculatedForm] = useState(false);
  const [calculatedFieldName, setCalculatedFieldName] = useState("calculated_field_1");
  const [leftOperand, setLeftOperand] = useState("");
  const [formulaOperator, setFormulaOperator] = useState<FormulaOperator>("*");
  const [rightOperand, setRightOperand] = useState("");
  const arrangedFields = tables.flatMap((table) =>
    table.fields.map((field) =>
      Object.assign({}, field, {
        tableId: table.id,
        tableLabel: table.label,
      }),
    ),
  );
  const visibleFields = [
    ...arrangedFields.filter((field) => field.selected),
    ...calculatedFields
      .filter((field) => field.selected)
      .map((field) =>
        Object.assign({}, field, {
          tableId: "calculated",
          tableLabel: "calculated_field",
        }),
      ),
  ];
  const displayNameCount = visibleFields.reduce<Record<string, number>>((counts, field) => {
    const displayName = field.displayName.trim();

    if (displayName) {
      counts[displayName] = (counts[displayName] ?? 0) + 1;
    }

    return counts;
  }, {});
  const previewFields: Array<(typeof visibleFields)[number] & { previewName: string }> =
    visibleFields.map((field) =>
      Object.assign({}, field, {
        previewName:
          displayNameCount[field.displayName.trim()] > 1
            ? `${field.tableLabel}.${field.displayName}`
            : field.displayName,
      }),
    );
  const canAddCalculatedField =
    fieldReferenceOptions.length >= 2 && calculatedFieldName.trim() && leftOperand && rightOperand;

  function submitCalculatedField() {
    if (!canAddCalculatedField) {
      return;
    }

    const leftOption = fieldReferenceOptions.find((item) => item.fieldKey === leftOperand);
    const rightOption = fieldReferenceOptions.find((item) => item.fieldKey === rightOperand);

    if (!leftOption || !rightOption) {
      return;
    }

    onAddCalculatedField({
      aggregation: "sum",
      dataType: "number",
      displayName: calculatedFieldName.trim(),
      expression: {
        leftFieldKey: leftOperand,
        operator: formulaOperator,
        rightFieldKey: rightOperand,
      },
      fieldKind: "calculated",
      id: `calc-${Date.now()}`,
      selected: true,
      semanticType: "measure",
      sourceName: `${leftOption.label} ${formulaOperator} ${rightOption.label}`,
    });
    setCalculatedFieldName(`calculated_field_${calculatedFields.length + 2}`);
    setLeftOperand("");
    setRightOperand("");
    setFormulaOperator("*");
    setShowCalculatedForm(false);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-transparent p-4">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/70 bg-white/62 backdrop-blur-sm">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/70 bg-white/52 px-4">
          <div className="flex items-center gap-2">
            <button
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                fieldView === "detail"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onFieldViewChange("detail")}
              type="button"
            >
              字段详情
            </button>
            <button
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                fieldView === "preview"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                onFieldViewChange("preview");
                onRefreshPreview();
              }}
              type="button"
            >
              数据预览
            </button>
          </div>
          {fieldView === "detail" ? (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowCalculatedForm((currentValue) => !currentValue)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="size-3.5" />
                计算字段
              </Button>
            </div>
          ) : null}
          {fieldView === "preview" ? (
            <div className="flex items-center gap-3">
              <Button
                disabled={loadingPreview}
                onClick={onRefreshPreview}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw className="size-3.5" />
                {loadingPreview ? "刷新中..." : "刷新"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {fieldView === "detail" ? (
            <div className="h-full overflow-auto">
              {showCalculatedForm ? (
                <div className="border-b border-border/70 bg-[#f8fbff] px-4 py-4">
                  <div className="grid grid-cols-[160px_minmax(0,1fr)_64px_minmax(0,1fr)_auto] items-center gap-3 max-xl:grid-cols-1">
                    <Input
                      placeholder="字段别名"
                      value={calculatedFieldName}
                      onChange={(event) => setCalculatedFieldName(event.target.value)}
                    />
                    <Select value={leftOperand} onValueChange={setLeftOperand}>
                      <SelectTrigger className="w-full min-w-0 bg-white">
                        <SelectValue placeholder="选择左字段" />
                      </SelectTrigger>
                      <FixedSelectContent className="w-96 min-w-(--radix-select-trigger-width)">
                        {fieldReferenceOptions.map((item) => (
                          <SelectItem
                            className="whitespace-nowrap"
                            key={item.fieldKey}
                            value={item.fieldKey}
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </FixedSelectContent>
                    </Select>
                    <Select
                      value={formulaOperator}
                      onValueChange={(value) => setFormulaOperator(value as FormulaOperator)}
                    >
                      <SelectTrigger className="w-16 justify-center bg-white [&>svg]:ml-1">
                        <SelectValue />
                      </SelectTrigger>
                      <FixedSelectContent className="w-16 min-w-16">
                        {(["+", "-", "*", "/"] as FormulaOperator[]).map((operator) => (
                          <SelectItem key={operator} value={operator}>
                            {operator}
                          </SelectItem>
                        ))}
                      </FixedSelectContent>
                    </Select>
                    <Select value={rightOperand} onValueChange={setRightOperand}>
                      <SelectTrigger className="w-full min-w-0 bg-white">
                        <SelectValue placeholder="选择右字段" />
                      </SelectTrigger>
                      <FixedSelectContent className="w-96 min-w-(--radix-select-trigger-width)">
                        {fieldReferenceOptions.map((item) => (
                          <SelectItem
                            className="whitespace-nowrap"
                            key={item.fieldKey}
                            value={item.fieldKey}
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </FixedSelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={!canAddCalculatedField}
                        onClick={submitCalculatedField}
                        size="sm"
                        type="button"
                      >
                        添加
                      </Button>
                      <Button
                        onClick={() => setShowCalculatedForm(false)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow className="bg-white hover:bg-white">
                    <TableHead>来源表</TableHead>
                    <TableHead>源字段</TableHead>
                    <TableHead>字段别名</TableHead>
                    <TableHead className="w-36">字段类型</TableHead>
                    <TableHead className="w-36">语义类型</TableHead>
                    <TableHead className="w-20">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewFields.length > 0 ? (
                    previewFields.map((field) => (
                      <TableRow key={`${field.tableId}-${field.id}`}>
                        <TableCell className="max-w-40 truncate text-muted-foreground">
                          {field.tableLabel}
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-muted-foreground">
                          {field.sourceName}
                        </TableCell>
                        <TableCell className="min-w-52 max-w-64">
                          <Input
                            aria-label={`编辑字段别名 ${field.displayName}`}
                            className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-border hover:bg-white focus-visible:border-ring focus-visible:bg-white"
                            value={field.displayName}
                            onChange={(event) => {
                              const patch = { displayName: event.target.value };

                              if (field.tableId === "calculated") {
                                onUpdateCalculatedField(field.id, patch);
                                return;
                              }

                              onUpdateField(field.tableId, field.id, patch);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <FieldTypeIcon type={field.dataType} />
                            {field.dataType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={field.semanticType}
                            onValueChange={(value) => {
                              const patch = {
                                aggregation:
                                  value === "measure" && field.aggregation === "none"
                                    ? "sum"
                                    : value === "measure"
                                      ? field.aggregation
                                      : "none",
                                semanticType: value as SemanticType,
                              };

                              if (field.tableId === "calculated") {
                                onUpdateCalculatedField(field.id, patch);
                                return;
                              }

                              onUpdateField(field.tableId, field.id, patch);
                            }}
                          >
                            <SelectTrigger className="h-8 w-28 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <FixedSelectContent>
                              <SelectItem value="dimension">维度</SelectItem>
                              <SelectItem value="measure">度量</SelectItem>
                              <SelectItem value="time">时间</SelectItem>
                            </FixedSelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {field.tableId === "calculated" ? (
                            <Button
                              aria-label={`移除 ${field.displayName}`}
                              onClick={() => onRemoveCalculatedField(field.id)}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <X className="size-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow text="暂无字段" />
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex h-full min-w-0 flex-col">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-max">
                  <TableHeader className="sticky top-0 z-10 bg-[#f3f6ff]">
                    <TableRow className="bg-[#f3f6ff] hover:bg-[#f3f6ff]">
                      {previewFields.length > 0 ? (
                        previewFields.map((field) => (
                          <TableHead
                            className="min-w-44 border-r border-border align-top"
                            key={`${field.tableId}-${field.id}`}
                          >
                            <div className="grid gap-2 py-2">
                              <span className="truncate text-sm font-normal text-foreground">
                                {field.previewName}
                              </span>
                              <span className="inline-flex items-center gap-2 text-xs font-normal text-muted-foreground">
                                <FieldTypeIcon type={field.dataType} />
                                {field.dataType}
                              </span>
                            </div>
                          </TableHead>
                        ))
                      ) : (
                        <TableHead>暂无字段</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.length > 0 ? (
                      previewRows.map((row, rowIndex) => (
                        <TableRow key={`preview-${rowIndex}`}>
                          {previewFields.map((field) => (
                            <TableCell
                              className="max-w-56 truncate border-r border-border text-muted-foreground"
                              key={`${rowIndex}-${field.tableId}-${field.id}`}
                            >
                              {row[field.previewName] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          className="h-96 text-center text-muted-foreground"
                          colSpan={Math.max(previewFields.length, 1)}
                        >
                          <div className="flex flex-col items-center justify-center">
                            <img
                              alt=""
                              className="mb-4 h-[120px] w-[160px]"
                              src="/empty-dataset.svg"
                            />
                            <p className="text-sm">
                              {loadingPreview ? "正在加载预览数据..." : "暂无预览数据"}
                            </p>
                            <Button
                              className="mt-5"
                              disabled={loadingPreview}
                              onClick={onRefreshPreview}
                              size="sm"
                              type="button"
                            >
                              <RefreshCw className="size-3.5" />
                              {loadingPreview ? "刷新中..." : "刷新"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FieldOutlineGroup({
  fields,
  title,
}: {
  fields: Array<EditableDatasetField & { tableId: string; tableLabel: string }>;
  title: string;
}) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="mb-3 flex items-center justify-between text-sm font-semibold">
        <span>{title}</span>
      </div>
      <div className="space-y-1">
        {fields.length > 0 ? (
          fields.map((field) => (
            <div
              className="flex h-8 items-center gap-2 rounded px-2 text-sm text-muted-foreground"
              key={`${field.tableId}-${field.id}`}
            >
              <FieldTypeIcon type={field.dataType} />
              <span className="truncate">{field.displayName}</span>
            </div>
          ))
        ) : (
          <div className="px-2 py-2 text-sm text-muted-foreground">暂无字段</div>
        )}
      </div>
    </div>
  );
}

function startDragTable(event: DragEvent<HTMLButtonElement>, tableId: string) {
  event.dataTransfer.setData("application/x-bi-table-id", tableId);
  event.dataTransfer.effectAllowed = "copy";
}

function allowDropTable(event: DragEvent<HTMLDivElement>) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function FixedSelectContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SelectContent
      align="start"
      className={cn("max-h-64 w-(--radix-select-trigger-width)", className)}
      position="popper"
      sideOffset={4}
    >
      {children}
    </SelectContent>
  );
}

function buildFieldKey(tableId: string, fieldId: string) {
  return `${tableId}:${fieldId}`;
}

function buildPreviewSourceKey(tableId: string, fieldId: string) {
  return `__src__${tableId}__${fieldId}`;
}

function getSchemaNameFromId(tableId: string) {
  const segments = tableId.split(".");

  return segments.length > 1 ? segments.slice(0, -1).join(".") : undefined;
}

function getTableNameFromId(tableId: string) {
  const segments = tableId.split(".");

  return segments.at(-1) || tableId;
}

function matchDatasetFieldToTable(tableId: string, sourceName: string) {
  const normalizedTableId = getTableNameFromId(tableId);
  return sourceName.startsWith(`${tableId}.`) || sourceName.startsWith(`${normalizedTableId}.`);
}

function mergeEditableFields(
  baseFields: EditableDatasetField[],
  detailFields: DatasetDetailField[],
  tableId: string,
) {
  return baseFields.map((field) => {
    const matchedField = detailFields.find((detailField) => {
      const normalizedSourceName =
        detailField.source_name.split(".").at(-1) || detailField.source_name;

      return (
        matchDatasetFieldToTable(tableId, detailField.source_name) &&
        normalizedSourceName === field.sourceName
      );
    });

    if (!matchedField) {
      return {
        ...field,
        selected: false,
      };
    }

    return {
      ...field,
      aggregation: (matchedField.aggregation as Aggregation | null) || field.aggregation,
      dataType: normalizeFieldType(matchedField.data_type),
      displayName: matchedField.display_name,
      selected: matchedField.selected,
      semanticType: matchedField.semantic_type,
      sourceName: matchedField.source_name.split(".").at(-1) || field.sourceName,
    };
  });
}

function getPreviewNumericValue(row: DatasetPreviewRow, fieldKey: string) {
  const [, tableId, fieldId] = fieldKey.match(/^(.*?):(.*)$/) ?? [];
  const rawValue = row[buildPreviewSourceKey(tableId || "", fieldId || "")];
  const nextValue = Number(rawValue);

  return Number.isFinite(nextValue) ? nextValue : null;
}

function calculatePreviewValue(
  leftValue: number | null,
  operator: FormulaOperator,
  rightValue: number | null,
) {
  if (leftValue === null || rightValue === null) {
    return "";
  }

  if (operator === "/" && rightValue === 0) {
    return "";
  }

  const result =
    operator === "+"
      ? leftValue + rightValue
      : operator === "-"
        ? leftValue - rightValue
        : operator === "*"
          ? leftValue * rightValue
          : leftValue / rightValue;

  return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(2)));
}

function getSlotPosition(slotId: string | undefined, index: number, tableCount: number) {
  const slot = resolveCanvasSlot(slotId);

  if (slot) {
    return { x: slot.x, y: slot.y };
  }

  return index === 0 ? { x: 56, y: Math.max(96, (tableCount - 1) * 56) } : { x: 360, y: 96 };
}

function getNextSlotId(tables: ModelTable[], preferredSlotId: string | null) {
  const occupiedSlotIds = new Set(tables.map((table) => table.slotId).filter(Boolean));

  if (preferredSlotId && !occupiedSlotIds.has(preferredSlotId)) {
    return preferredSlotId;
  }

  if (tables.length === 0) {
    return "root";
  }

  return getAvailableSlots(tables).find((slot) => !occupiedSlotIds.has(slot.id))?.id;
}

function getNextSlotIdForParent(tables: ModelTable[], parentTableId: string) {
  return getAvailableSlots(tables).find((slot) => {
    const parentTable = getParentTableForSlot(tables, slot.id);

    return parentTable?.id === parentTableId;
  })?.id;
}

function getNearestAvailableSlotId(
  canvasElement: HTMLElement,
  clientX: number,
  clientY: number,
  slots: CanvasSlot[],
) {
  if (slots.length === 0) {
    return undefined;
  }

  const rect = canvasElement.getBoundingClientRect();
  const dropPoint = {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };

  return slots
    .map((slot) => ({
      distance: Math.hypot(slot.x + 90 - dropPoint.x, slot.y + 21 - dropPoint.y),
      slot,
    }))
    .toSorted((left, right) => left.distance - right.distance)[0]?.slot.id;
}

function getAvailableSlots(tables: ModelTable[]) {
  if (tables.length === 0) {
    return canvasSlots.filter((slot) => slot.id === "root");
  }

  const occupiedSlotIds = new Set(tables.map((table) => table.slotId).filter(Boolean));
  const staticSlots = canvasSlots.filter((slot) => {
    if (occupiedSlotIds.has(slot.id) || slot.id === "root") {
      return false;
    }

    return Boolean(
      slot.parentId &&
        occupiedSlotIds.has(slot.parentId) &&
        (slot.parentId === "root" || !relationshipsHasChild(tables, slot.parentId)),
    );
  });
  const dynamicSlots = tables.flatMap((table) => {
    if (!table.slotId) {
      return [];
    }

    if (table.slotId !== "root" && relationshipsHasChild(tables, table.slotId)) {
      return [];
    }

    const parentPosition = resolveCanvasSlot(table.slotId);

    if (!parentPosition) {
      return [];
    }

    const childCount = tables.filter(
      (item) => item.slotId && resolveCanvasSlot(item.slotId)?.parentId === table.slotId,
    ).length;
    const nextSlot: CanvasSlot = {
      id: buildDynamicSlotId(table.slotId, childCount + 1),
      parentId: table.slotId,
      x: parentPosition.x + 320,
      y: parentPosition.y + childCount * 96,
    };

    return occupiedSlotIds.has(nextSlot.id) ? [] : [nextSlot];
  });

  return getNextSlotsByParent(dedupeCanvasSlots([...staticSlots, ...dynamicSlots]));
}

function relationshipsHasChild(tables: ModelTable[], slotId: string) {
  return tables.some((table) => table.slotId && resolveCanvasSlot(table.slotId)?.parentId === slotId);
}

function getParentTableForSlot(tables: ModelTable[], slotId: string | undefined) {
  const slot = resolveCanvasSlot(slotId);

  if (!slot?.parentId) {
    return null;
  }

  return tables.find((table) => table.slotId === slot.parentId) ?? null;
}

function canConnectAdjacentTables(leftTable: ModelTable, rightTable: ModelTable) {
  if (!leftTable.slotId || !rightTable.slotId) {
    return false;
  }

  const rightSlot = resolveCanvasSlot(rightTable.slotId);

  return rightSlot?.parentId === leftTable.slotId;
}

function resolveCanvasSlot(slotId: string | undefined): CanvasSlot | undefined {
  if (!slotId) {
    return undefined;
  }

  const slot = canvasSlots.find((item) => item.id === slotId);

  if (slot) {
    return slot;
  }

  const dynamicSlot = parseDynamicSlotId(slotId);

  if (!dynamicSlot) {
    return undefined;
  }

  const parentSlot = resolveCanvasSlot(dynamicSlot.parentId);

  if (!parentSlot) {
    return undefined;
  }

  return {
    id: slotId,
    parentId: dynamicSlot.parentId,
    x: parentSlot.x + 320,
    y: parentSlot.y + (dynamicSlot.index - 1) * 96,
  };
}

function buildDynamicSlotId(parentId: string, index: number) {
  return `auto:${encodeURIComponent(parentId)}:${index}`;
}

function parseDynamicSlotId(slotId: string) {
  const match = /^auto:(.*):(\d+)$/.exec(slotId);

  if (!match) {
    return null;
  }

  return {
    index: Number(match[2]),
    parentId: decodeURIComponent(match[1]),
  };
}

function dedupeCanvasSlots(slots: CanvasSlot[]) {
  const seen = new Set<string>();

  return slots.filter((slot) => {
    if (seen.has(slot.id)) {
      return false;
    }

    seen.add(slot.id);
    return true;
  });
}

function getNextSlotsByParent(slots: CanvasSlot[]) {
  const nextSlots = new Map<string, CanvasSlot>();

  for (const slot of slots) {
    const parentId = slot.parentId ?? "__root__";
    const currentSlot = nextSlots.get(parentId);

    if (!currentSlot || slot.x < currentSlot.x || (slot.x === currentSlot.x && slot.y < currentSlot.y)) {
      nextSlots.set(parentId, slot);
    }
  }

  return [...nextSlots.values()];
}

function normalizeFields(fields: LocalFileField[], tableLabel: string): EditableDatasetField[] {
  return fields.map((field, index) => {
    const dataType = normalizeFieldType(String(field.type || "text"));
    const semanticType =
      dataType === "date" ? "time" : dataType === "number" ? "measure" : "dimension";
    const sourceName = String(
      field.source_name || field.name || field.display_name || `字段${index + 1}`,
    );
    const normalizedSourceName = sourceName.split(".").at(-1) || sourceName;

    return {
      aggregation: semanticType === "measure" ? "sum" : "none",
      dataType,
      displayName: `${tableLabel}.${normalizedSourceName}`,
      fieldKind: "source",
      id: `${index}-${sourceName}`,
      selected: true,
      semanticType,
      sourceName: normalizedSourceName,
    };
  });
}

function normalizeDatasourceFields(
  fields: DatasourcePreviewField[],
  tableLabel: string,
): EditableDatasetField[] {
  return fields.map((field, index) => {
    const dataType = normalizeFieldType(field.type);
    const semanticType =
      dataType === "date" ? "time" : dataType === "number" ? "measure" : "dimension";

    return {
      aggregation: semanticType === "measure" ? "sum" : "none",
      dataType,
      displayName: `${tableLabel}.${field.name}`,
      fieldKind: "source",
      id: `${index}-${field.name}`,
      selected: true,
      semanticType,
      sourceName: field.name,
    };
  });
}

function normalizeFieldType(type: string): FieldType {
  const normalizedType = type.toLowerCase();

  if (
    normalizedType.includes("date") ||
    normalizedType.includes("time") ||
    normalizedType === "timestamp"
  ) {
    return "date";
  }

  if (
    normalizedType.includes("int") ||
    normalizedType.includes("numeric") ||
    normalizedType.includes("decimal") ||
    normalizedType.includes("double") ||
    normalizedType.includes("real") ||
    normalizedType.includes("float")
  ) {
    return "number";
  }

  return "text";
}

function FieldTypeIcon({ type }: { type: FieldType }) {
  if (type === "date") {
    return <Clock3 className="size-4 text-blue-500" />;
  }

  if (type === "number") {
    return <Hash className="size-4 text-emerald-500" />;
  }

  return <Type className="size-4 text-sky-500" />;
}

function TableFlowNode({ data }: NodeProps<FlowTableNode>) {
  return (
    <div className="group relative flex h-[42px] w-[180px] items-center rounded-lg bg-white px-3 text-sm">
      {data.removable ? (
        <button
          aria-label={`移除 ${data.label}`}
          className="nodrag nopan absolute -right-2 -top-2 z-10 hidden size-5 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow-sm hover:text-foreground group-hover:flex"
          onClick={(event) => {
            event.stopPropagation();
            data.onRemove(data.tableId);
          }}
          type="button"
        >
          <X className="size-3" />
        </button>
      ) : null}
      <Handle
        className={[
          "!size-2.5 !border-2 !border-primary !bg-white",
          data.hasPrevious ? "" : "!opacity-0",
        ].join(" ")}
        isConnectable={data.hasPrevious}
        position={Position.Left}
        type="target"
      />
      <span className="truncate">{data.label}</span>
      <Handle
        className={[
          "!size-2.5 !border-2 !border-primary !bg-white",
          data.hasNext ? "" : "!opacity-0",
        ].join(" ")}
        isConnectable={data.hasNext}
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

function SlotFlowNode({ data }: NodeProps<FlowSlotNode>) {
  return (
    <div
      className="nodrag nopan relative flex h-[42px] w-[180px] items-center rounded-lg border border-dashed border-border bg-white/50 px-3 text-sm text-muted-foreground"
      onDragOver={allowDropTable}
      onDrop={(event) => data.onDropTable(event, data.slotId)}
    >
      <Handle
        className="!size-2.5 !border-2 !border-foreground !bg-white"
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      拖拽至此建立关系
    </div>
  );
}

function FieldSelect({
  fields,
  onChange,
  value,
}: {
  fields: EditableDatasetField[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-0 bg-white">
        <SelectValue placeholder="选择字段" />
      </SelectTrigger>
      <FixedSelectContent className="w-80 min-w-(--radix-select-trigger-width)">
        {fields.map((field) => (
          <SelectItem className="whitespace-nowrap" key={field.id} value={field.sourceName}>
            {field.sourceName}
          </SelectItem>
        ))}
      </FixedSelectContent>
    </Select>
  );
}

function RelationshipInspector({
  onFieldToggle,
  onRemove,
  onUpdate,
  relationship,
  tables,
}: {
  onFieldToggle: (tableId: string, fieldId: string, selected: boolean) => void;
  onRemove: (relationshipId: string) => void;
  onUpdate: (relationshipId: string, patch: Partial<ModelRelationship>) => void;
  relationship: ModelRelationship;
  tables: ModelTable[];
}) {
  const leftTable = tables.find((table) => table.id === relationship.leftTableId);
  const rightTable = tables.find((table) => table.id === relationship.rightTableId);
  const firstCondition = relationship.conditions[0];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border bg-[#f8fafc] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium">{leftTable?.label || "左表"}</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {getJoinTypeLabel(relationship.joinType)}
          </span>
          <span className="truncate font-medium">{rightTable?.label || "右表"}</span>
        </div>
        <Button
          aria-label="删除关联关系"
          onClick={() => onRemove(relationship.id)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 bg-[#f6f8fb] p-4">
        <div className="rounded-lg bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">选择关联方式</h3>
          <Select
            value={relationship.joinType}
            onValueChange={(value) =>
              onUpdate(relationship.id, { joinType: value as ModelRelationship["joinType"] })
            }
          >
            <SelectTrigger className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <FixedSelectContent>
              <SelectItem value="left">左关联</SelectItem>
              <SelectItem value="right">右关联</SelectItem>
              <SelectItem value="inner">内关联</SelectItem>
              <SelectItem value="full">全关联</SelectItem>
            </FixedSelectContent>
          </Select>

          <h3 className="mb-3 mt-6 text-sm font-semibold">设置关联键</h3>
          <div className="grid grid-cols-[minmax(180px,1fr)_56px_minmax(180px,1fr)] items-center gap-2">
            <FieldSelect
              fields={leftTable?.fields ?? []}
              value={firstCondition?.leftField ?? ""}
              onChange={(value) =>
                updateRelationshipCondition(onUpdate, relationship, firstCondition?.id, {
                  leftField: value,
                })
              }
            />
            <Select
              value={firstCondition?.operator ?? "="}
              onValueChange={(value) =>
                updateRelationshipCondition(onUpdate, relationship, firstCondition?.id, {
                  operator: value as RelationshipCondition["operator"],
                })
              }
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <FixedSelectContent>
                {["=", "!=", ">", ">=", "<", "<="].map((operator) => (
                  <SelectItem key={operator} value={operator}>
                    {operator}
                  </SelectItem>
                ))}
              </FixedSelectContent>
            </Select>
            <FieldSelect
              fields={rightTable?.fields ?? []}
              value={firstCondition?.rightField ?? ""}
              onChange={(value) =>
                updateRelationshipCondition(onUpdate, relationship, firstCondition?.id, {
                  rightField: value,
                })
              }
            />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">快速选择展示字段</h3>
          <div className="grid grid-cols-2 gap-3">
            <RelationshipFieldList table={leftTable} title="左表" onFieldToggle={onFieldToggle} />
            <RelationshipFieldList table={rightTable} title="右表" onFieldToggle={onFieldToggle} />
          </div>
        </div>
      </div>
    </section>
  );
}

function RelationshipFieldList({
  onFieldToggle,
  table,
  title,
}: {
  onFieldToggle: (tableId: string, fieldId: string, selected: boolean) => void;
  table?: ModelTable;
  title: string;
}) {
  if (!table) {
    return null;
  }

  return (
    <div className="rounded-lg bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{title}</span>
        <span className="truncate">{table.label}</span>
      </div>
      <div className="space-y-2">
        {table.fields.map((field) => (
          <label className="flex items-center gap-2 text-sm" key={field.id}>
            <input
              checked={field.selected}
              className="size-4 accent-primary"
              onChange={(event) => onFieldToggle(table.id, field.id, event.target.checked)}
              type="checkbox"
            />
            <span className="truncate">{field.sourceName}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function updateRelationshipCondition(
  onUpdate: (relationshipId: string, patch: Partial<ModelRelationship>) => void,
  relationship: ModelRelationship,
  conditionId: string | undefined,
  patch: Partial<RelationshipCondition>,
) {
  onUpdate(relationship.id, {
    conditions: relationship.conditions.map((condition, index) =>
      condition.id === conditionId || (!conditionId && index === 0)
        ? { ...condition, ...patch }
        : condition,
    ),
  });
}

function getJoinTypeLabel(joinType: ModelRelationship["joinType"]) {
  const labels: Record<ModelRelationship["joinType"], string> = {
    full: "全关联",
    inner: "内关联",
    left: "左关联",
    right: "右关联",
  };

  return labels[joinType];
}

function EmptyRow({ text }: { text: string }) {
  return (
    <TableRow>
      <TableCell className="py-14 text-center text-muted-foreground" colSpan={6}>
        {text}
      </TableCell>
    </TableRow>
  );
}
