from typing import Literal

from pydantic import BaseModel, Field

SemanticType = Literal["dimension", "measure", "time"]
AggregationType = Literal["sum", "avg", "count", "max", "min"]
GranularityType = Literal["day", "week", "month"]
QueryType = Literal["metric", "trend", "breakdown", "table"]


class DatasetFieldProfile(BaseModel):
    field_id: str
    display_name: str
    source_name: str
    source_table: str | None = None
    source_field: str | None = None
    data_type: str
    semantic_type: SemanticType
    aggregation: AggregationType | None = None
    field_kind: Literal["source", "calculated"] = "source"
    expression: dict | None = None
    selected: bool = True


class DatasetRelationshipConditionProfile(BaseModel):
    left_field: str
    operator: str
    right_field: str


class DatasetRelationshipProfile(BaseModel):
    left_table: str
    right_table: str
    join_type: Literal["left", "right", "inner", "full"] = "left"
    conditions: list[DatasetRelationshipConditionProfile] = Field(default_factory=list)


class DatasetProfile(BaseModel):
    dataset_id: str
    dataset_name: str
    datasource_id: str
    source_tables: list[str]
    relationships: list[DatasetRelationshipProfile] = Field(default_factory=list)
    fields: list[DatasetFieldProfile]
    measures: list[str]
    dimensions: list[str]
    time_fields: list[str]
    default_time_field: str | None = None


class DatasetQueryFieldRef(BaseModel):
    field: str
    alias: str | None = None


class DatasetMeasureSpec(BaseModel):
    field: str
    aggregation: AggregationType
    alias: str


class DatasetFilterSpec(BaseModel):
    field: str
    op: Literal["=", "!=", "in", ">", "<", ">=", "<="]
    value: str | int | float | bool | list[str] | list[int] | list[float]


class DatasetSortSpec(BaseModel):
    field: str
    direction: Literal["asc", "desc"]


class DatasetQueryRequest(BaseModel):
    query_type: QueryType
    dimensions: list[DatasetQueryFieldRef] = Field(default_factory=list)
    measures: list[DatasetMeasureSpec] = Field(default_factory=list)
    filters: list[DatasetFilterSpec] = Field(default_factory=list)
    sort: list[DatasetSortSpec] = Field(default_factory=list)
    limit: int | None = None
    granularity: GranularityType | None = None


class DatasetQueryResult(BaseModel):
    columns: list[str]
    rows: list[dict]
    meta: dict = Field(default_factory=dict)
