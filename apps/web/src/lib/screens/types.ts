export type JsonRenderSpec = {
  dataBindings?: Record<string, unknown>;
  elements: Record<
    string,
    {
      children?: string[];
      props: Record<string, unknown>;
      type: string;
    }
  >;
  meta?: {
    datasetId?: string;
    template?: string;
    theme?: string;
    title?: string;
  };
  root: string;
  version?: string;
};

export type MetricResult = {
  changeRate?: number | null;
  changeValue?: number | null;
  compareValue?: number | null;
  type: "metric";
  value: number | null;
};

export type TrendResult = {
  items?: Array<Record<string, number | string | null>>;
  points: Array<{ x: string; y: number | null }>;
  series?: string[];
  type: "trend";
};

export type BreakdownResult = {
  items: Array<{ label: string; value: number | null } | Record<string, number | string | null>>;
  series?: string[];
  type: "breakdown";
};

export type TableResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  type: "table";
};

export type WidgetResult = BreakdownResult | MetricResult | TableResult | TrendResult;

export type PreviewData = Record<string, WidgetResult>;

export type GeneratePreviewResponse = {
  ok: boolean;
  screen?: {
    dataset_id: string;
    meta?: {
      template: string;
      warnings: string[];
    };
    name: string;
    preview_data?: PreviewData;
    spec: JsonRenderSpec;
  };
};

export type ScreenStatus = "draft" | "published";

export type ScreenRecord = NonNullable<GeneratePreviewResponse["screen"]> & {
  id: string;
  preview_data: PreviewData;
  prompt: string;
  status: ScreenStatus;
  updated_at?: string;
};

export type ScreenResponse = {
  ok: boolean;
  screen?: ScreenRecord | null;
};

export type ScreenStatusResponse = {
  ok: boolean;
  screen?: ScreenRecord | null;
};

export type DatasetRecord = {
  id: string;
  name: string;
  status: string;
};
