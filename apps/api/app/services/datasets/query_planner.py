from psycopg import sql
from psycopg.sql import Composable
from pydantic import BaseModel

from app.services.datasets.field_compiler import compile_field_expression
from app.services.datasets.types import DatasetProfile, DatasetQueryRequest


class SqlQueryPlan(BaseModel):
    query: Composable
    columns: list[str]
    query_type: str

    model_config = {"arbitrary_types_allowed": True}


def build_query_plan(
    profile: DatasetProfile, request: DatasetQueryRequest
) -> SqlQueryPlan:
    table_aliases = build_table_alias_map(profile)
    from_clause = build_from_and_joins(profile, table_aliases)
    select_clause, columns, group_by_items = build_select_clause(
        profile, request, table_aliases
    )
    where_clause = build_where_clause(profile, request, table_aliases)
    order_by_clause = build_order_by_clause(request)
    limit_clause = build_limit_clause(request)
    query_parts: list[Composable] = [
        sql.SQL("SELECT "),
        select_clause,
        sql.SQL(" FROM "),
        from_clause,
    ]

    if where_clause:
        query_parts.extend([sql.SQL(" WHERE "), where_clause])

    if group_by_items:
        query_parts.extend([sql.SQL(" GROUP BY "), sql.SQL(", ").join(group_by_items)])

    if order_by_clause:
        query_parts.extend([sql.SQL(" ORDER BY "), order_by_clause])

    if limit_clause:
        query_parts.append(limit_clause)

    return SqlQueryPlan(
        query=sql.Composed(query_parts),
        columns=columns,
        query_type=request.query_type,
    )


def build_table_alias_map(profile: DatasetProfile) -> dict[str, str]:
    return {
        table_id: f"t{index}" for index, table_id in enumerate(profile.source_tables)
    }


def build_from_and_joins(
    profile: DatasetProfile,
    table_aliases: dict[str, str],
) -> Composable:
    if not profile.source_tables:
        raise ValueError("数据集没有来源表")

    query_parts: list[Composable] = [
        table_reference(profile.source_tables[0]),
        sql.SQL(" AS "),
        sql.Identifier(table_aliases[profile.source_tables[0]]),
    ]
    join_type_map = {
        "full": sql.SQL("FULL JOIN"),
        "inner": sql.SQL("INNER JOIN"),
        "left": sql.SQL("LEFT JOIN"),
        "right": sql.SQL("RIGHT JOIN"),
    }

    for relationship in profile.relationships:
        if (
            relationship.left_table not in table_aliases
            or relationship.right_table not in table_aliases
            or not relationship.conditions
        ):
            continue

        join_conditions = [
            sql.SQL("{}.{} {} {}.{}").format(
                sql.Identifier(table_aliases[relationship.left_table]),
                sql.Identifier(condition.left_field),
                sql.SQL(
                    condition.operator
                    if condition.operator in {"=", "!=", "<", "<=", ">", ">="}
                    else "="
                ),
                sql.Identifier(table_aliases[relationship.right_table]),
                sql.Identifier(condition.right_field),
            )
            for condition in relationship.conditions
        ]
        query_parts.extend(
            [
                sql.SQL(" "),
                join_type_map.get(relationship.join_type, sql.SQL("LEFT JOIN")),
                sql.SQL(" "),
                table_reference(relationship.right_table),
                sql.SQL(" AS "),
                sql.Identifier(table_aliases[relationship.right_table]),
                sql.SQL(" ON "),
                sql.SQL(" AND ").join(join_conditions),
            ]
        )

    return sql.Composed(query_parts)


def build_select_clause(
    profile: DatasetProfile,
    request: DatasetQueryRequest,
    table_aliases: dict[str, str],
) -> tuple[Composable, list[str], list[Composable]]:
    select_items: list[Composable] = []
    columns: list[str] = []
    group_by_items: list[Composable] = []

    for dimension in request.dimensions:
        alias = dimension.alias or dimension.field
        expression = compile_dimension_expression(
            profile, request, dimension.field, table_aliases
        )
        select_items.append(
            sql.SQL("{} AS {}").format(expression, sql.Identifier(alias))
        )
        columns.append(alias)
        group_by_items.append(expression)

    for measure in request.measures:
        expression = compile_field_expression(profile, measure.field, table_aliases)
        aggregate_expression = sql.SQL("{}({}) AS {}").format(
            sql.SQL(measure.aggregation.upper()),
            expression,
            sql.Identifier(measure.alias),
        )
        select_items.append(aggregate_expression)
        columns.append(measure.alias)

    if not select_items:
        raise ValueError("查询至少需要一个字段")

    return sql.SQL(", ").join(select_items), columns, group_by_items


def compile_dimension_expression(
    profile: DatasetProfile,
    request: DatasetQueryRequest,
    field_name: str,
    table_aliases: dict[str, str],
) -> Composable:
    expression = compile_field_expression(profile, field_name, table_aliases)

    field = next(
        (
            item
            for item in profile.fields
            if item.field_id == field_name
            or item.display_name == field_name
            or item.source_name == field_name
        ),
        None,
    )

    if request.granularity and field and field.field_id in profile.time_fields:
        date_part = {
            "day": "day",
            "week": "week",
            "month": "month",
        }.get(request.granularity, "month")

        return sql.SQL("DATE_TRUNC({}, {})").format(sql.Literal(date_part), expression)

    return expression


def build_order_by_clause(request: DatasetQueryRequest) -> Composable | None:
    if not request.sort:
        return None

    return sql.SQL(", ").join(
        sql.SQL("{} {}").format(
            sql.Identifier(item.field),
            sql.SQL("DESC" if item.direction == "desc" else "ASC"),
        )
        for item in request.sort
    )


def build_where_clause(
    profile: DatasetProfile,
    request: DatasetQueryRequest,
    table_aliases: dict[str, str],
) -> Composable | None:
    items: list[Composable] = []

    for item in request.filters:
        expression = compile_field_expression(profile, item.field, table_aliases)

        if item.op == "in":
            values = item.value if isinstance(item.value, list) else [item.value]

            if not values:
                continue

            items.append(
                sql.SQL("{} IN ({})").format(
                    expression,
                    sql.SQL(", ").join(sql.Literal(value) for value in values),
                )
            )
            continue

        operator = item.op if item.op in {"=", "!=", ">", "<", ">=", "<="} else "="
        items.append(
            sql.SQL("{} {} {}").format(
                expression,
                sql.SQL(operator),
                sql.Literal(item.value),
            )
        )

    return sql.SQL(" AND ").join(items) if items else None


def build_limit_clause(request: DatasetQueryRequest) -> Composable | None:
    if request.limit is None:
        return None

    return sql.SQL(" LIMIT {}").format(sql.Literal(max(min(request.limit, 200), 1)))


def table_reference(table_id: str) -> Composable:
    if "." not in table_id:
        return sql.Identifier(table_id)

    schema_name, table_name = table_id.split(".", 1)
    return sql.SQL("{}.{}").format(
        sql.Identifier(schema_name), sql.Identifier(table_name)
    )
