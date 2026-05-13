from psycopg import sql
from psycopg.sql import Composable

from app.services.datasets.types import DatasetFieldProfile, DatasetProfile


def find_field(profile: DatasetProfile, field_name: str) -> DatasetFieldProfile | None:
    field_ref = parse_field_reference(field_name)

    if field_ref:
        table_id, column_name = field_ref
        matched_by_source = next(
            (
                field
                for field in profile.fields
                if field.source_table == table_id and field.source_field == column_name
            ),
            None,
        )

        if matched_by_source:
            return matched_by_source

    return next(
        (
            field
            for field in profile.fields
            if field.display_name == field_name
            or field.source_name == field_name
            or field.field_id == field_name
        ),
        None,
    )


def compile_field_expression(
    profile: DatasetProfile,
    field_name: str,
    table_aliases: dict[str, str],
) -> Composable:
    normalized_field_name = normalize_field_key(field_name)
    field = find_field(profile, field_name)

    if not field:
        field = find_field(profile, normalized_field_name)

    if not field and "." in normalized_field_name:
        return resolve_source_field_sql(profile, normalized_field_name, table_aliases)

    if not field:
        raise ValueError(f"字段不存在：{field_name}")

    if field.field_kind == "calculated":
        return compile_calculated_field_sql(profile, field, table_aliases)

    if field.source_table and field.source_field:
        return resolve_source_field_sql(
            profile,
            f"{field.source_table}.{field.source_field}",
            table_aliases,
        )

    return resolve_source_field_sql(profile, field.source_name, table_aliases)


def resolve_source_field_sql(
    profile: DatasetProfile,
    source_name: str,
    table_aliases: dict[str, str],
) -> Composable:
    table_id, column_name = split_source_name(profile, source_name)
    table_alias = table_aliases.get(table_id)

    if not table_alias:
        raise ValueError(f"字段所属表不存在：{source_name}")

    return sql.SQL("{}.{}").format(
        sql.Identifier(table_alias), sql.Identifier(column_name)
    )


def split_source_name(profile: DatasetProfile, source_name: str) -> tuple[str, str]:
    source_tables = sorted(profile.source_tables, key=len, reverse=True)

    for table_id in source_tables:
        prefix = f"{table_id}."
        if source_name.startswith(prefix):
            return table_id, source_name[len(prefix) :]

    for table_id in source_tables:
        table_name = table_id.split(".")[-1]
        prefix = f"{table_name}."
        if source_name.startswith(prefix):
            return table_id, source_name[len(prefix) :]

    if "." in source_name and len(profile.source_tables) > 1:
        table_id, column_name = source_name.rsplit(".", 1)
        return table_id, column_name

    if not profile.source_tables:
        raise ValueError("数据集没有来源表")

    return profile.source_tables[0], source_name.split(".")[-1]


def compile_calculated_field_sql(
    profile: DatasetProfile,
    field: DatasetFieldProfile,
    table_aliases: dict[str, str],
) -> Composable:
    expression = field.expression or {}
    operator = expression.get("operator")

    if operator not in {"+", "-", "*", "/"}:
        raise ValueError(f"计算字段操作符不支持：{operator}")

    left_key = str(expression.get("leftFieldKey") or "")
    right_key = str(expression.get("rightFieldKey") or "")

    if not left_key or not right_key:
        raise ValueError(f"计算字段表达式不完整：{field.display_name}")

    left = compile_field_expression(profile, left_key, table_aliases)
    right = compile_field_expression(profile, right_key, table_aliases)

    return sql.SQL("({} {} {})").format(left, sql.SQL(operator), right)


def normalize_field_key(field_key: str) -> str:
    if ":" in field_key:
        _, field_key = field_key.split(":", 1)

    if "-" in field_key:
        return field_key.rsplit("-", 1)[-1]

    return field_key


def parse_field_reference(field_key: str) -> tuple[str, str] | None:
    if ":" not in field_key:
        return None

    table_id, raw_field_id = field_key.split(":", 1)
    field_name = normalize_field_key(raw_field_id)

    if not table_id or not field_name:
        return None

    return table_id, field_name
