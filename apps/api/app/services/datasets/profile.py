from fastapi import HTTPException

from app.database import get_dataset_detail
from app.services.datasets.types import (
    AggregationType,
    DatasetFieldProfile,
    DatasetProfile,
    DatasetRelationshipConditionProfile,
    DatasetRelationshipProfile,
    SemanticType,
)


def split_source_tables(source_tables: object) -> list[str]:
    if isinstance(source_tables, list):
        return [str(item).strip() for item in source_tables if str(item).strip()]

    return []


def normalize_semantic_type(value: object) -> SemanticType:
    if value in {"measure", "time"}:
        return value

    return "dimension"


def normalize_aggregation(value: object) -> AggregationType | None:
    if value in {"sum", "avg", "count", "max", "min"}:
        return value

    return None


def build_dataset_profile(dataset_id: str) -> DatasetProfile:
    detail = get_dataset_detail(dataset_id)

    if not detail:
        raise HTTPException(status_code=404, detail="数据集不存在")

    source_tables = split_source_tables(detail.get("source_tables"))
    fields = [
        build_field_profile(field, source_tables)
        for field in detail.get("fields", [])
        if isinstance(field, dict) and bool(field.get("selected", True))
    ]
    relationships = [
        build_relationship_profile(relationship)
        for relationship in detail.get("relationships", [])
        if isinstance(relationship, dict)
    ]
    measures = [field.field_id for field in fields if field.semantic_type == "measure"]
    dimensions = [
        field.field_id for field in fields if field.semantic_type == "dimension"
    ]
    time_fields = [field.field_id for field in fields if field.semantic_type == "time"]

    profile = DatasetProfile(
        dataset_id=str(detail.get("id") or dataset_id),
        dataset_name=str(detail.get("name") or "未命名数据集"),
        datasource_id=str(detail.get("datasource_id") or ""),
        source_tables=source_tables,
        relationships=relationships,
        fields=fields,
        measures=measures,
        dimensions=dimensions,
        time_fields=time_fields,
    )

    return profile.model_copy(
        update={"default_time_field": infer_default_time_field(profile)}
    )


def build_field_profile(field: dict, source_tables: list[str]) -> DatasetFieldProfile:
    config = field.get("config") if isinstance(field.get("config"), dict) else {}
    field_kind = str(config.get("field_kind") or "source")
    source_name = str(field.get("source_name") or field.get("display_name") or "")
    source_table, source_field = split_field_source(source_name, source_tables)

    return DatasetFieldProfile(
        field_id=str(field.get("id") or field.get("display_name") or ""),
        display_name=str(field.get("display_name") or field.get("source_name") or ""),
        source_name=source_name,
        source_table=source_table,
        source_field=source_field,
        data_type=str(field.get("data_type") or "text"),
        semantic_type=normalize_semantic_type(field.get("semantic_type")),
        aggregation=normalize_aggregation(field.get("aggregation")),
        field_kind="calculated" if field_kind == "calculated" else "source",
        expression=config.get("expression") if isinstance(config, dict) else None,
        selected=bool(field.get("selected", True)),
    )


def split_field_source(
    source_name: str, source_tables: list[str]
) -> tuple[str | None, str | None]:
    for table_id in sorted(source_tables, key=len, reverse=True):
        prefix = f"{table_id}."
        if source_name.startswith(prefix):
            return table_id, source_name[len(prefix) :]

    for table_id in source_tables:
        table_name = table_id.split(".")[-1]
        prefix = f"{table_name}."
        if source_name.startswith(prefix):
            return table_id, source_name[len(prefix) :]

    if "." in source_name and len(source_tables) > 1:
        table_id, column_name = source_name.rsplit(".", 1)
        return table_id, column_name

    if not source_name:
        return None, None

    return source_tables[0] if source_tables else None, source_name.split(".")[-1]


def build_relationship_profile(relationship: dict) -> DatasetRelationshipProfile:
    raw_conditions = relationship.get("conditions")
    conditions = (
        [
            DatasetRelationshipConditionProfile(
                left_field=str(condition.get("left_field") or ""),
                operator=str(condition.get("operator") or "="),
                right_field=str(condition.get("right_field") or ""),
            )
            for condition in raw_conditions
            if isinstance(condition, dict)
        ]
        if isinstance(raw_conditions, list)
        else []
    )
    join_type = str(relationship.get("join_type") or "left")

    return DatasetRelationshipProfile(
        left_table=str(relationship.get("left_table") or ""),
        right_table=str(relationship.get("right_table") or ""),
        join_type=join_type
        if join_type in {"left", "right", "inner", "full"}
        else "left",
        conditions=conditions,
    )


def infer_default_time_field(profile: DatasetProfile) -> str | None:
    if not profile.time_fields:
        return None

    preferred_keywords = ("日期", "时间", "date", "time", "month", "day")

    for field_name in profile.time_fields:
        if any(keyword in field_name.lower() for keyword in preferred_keywords):
            return field_name

    return profile.time_fields[0]
