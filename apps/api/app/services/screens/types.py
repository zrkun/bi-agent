from typing import Literal

from pydantic import BaseModel, Field

TemplateType = Literal[
    "executive_overview",
    "trend_analysis",
    "dimension_breakdown",
    "complex_business_overview",
]
WidgetType = Literal[
    "metric",
    "area",
    "line",
    "multi_line",
    "bar",
    "multi_bar",
    "pie",
    "radar",
    "radial",
    "table",
    "rank",
    "donut",
    "progress",
]


class BindingFieldPlan(BaseModel):
    measure: str | None = None
    measures: list[str] = Field(default_factory=list)
    dimension: str | None = None
    time: str | None = None


class BindingSortPlan(BaseModel):
    field: str
    direction: Literal["asc", "desc"]


class WidgetBindingPlan(BaseModel):
    query_type: Literal["metric", "trend", "breakdown", "table"]
    fields: BindingFieldPlan
    aggregation: Literal["sum", "avg", "count", "max", "min"] | None = None
    granularity: Literal["day", "week", "month"] | None = None
    sort: BindingSortPlan | None = None
    limit: int | None = None
    format: Literal["number", "currency", "percent"] | None = None
    show_comparison: bool = False


class WidgetPlan(BaseModel):
    id: str
    slot: str
    widget_type: WidgetType
    title: str
    binding_key: str
    binding: WidgetBindingPlan


class ScreenPlan(BaseModel):
    title: str
    template: TemplateType
    theme: Literal["dark", "light"] = "dark"
    widgets: list[WidgetPlan]
    warnings: list[str] = Field(default_factory=list)


class GeneratePreviewMeta(BaseModel):
    template: TemplateType
    warnings: list[str] = Field(default_factory=list)


class GeneratePreviewPayload(BaseModel):
    name: str
    dataset_id: str
    spec: dict
    preview_data: dict
    meta: GeneratePreviewMeta
