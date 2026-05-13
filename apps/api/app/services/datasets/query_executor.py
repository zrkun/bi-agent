from decimal import Decimal
from typing import Any

import psycopg

from app.database import get_datasource
from app.services.datasets.query_planner import SqlQueryPlan, build_query_plan
from app.services.datasets.types import DatasetProfile, DatasetQueryRequest


def execute_dataset_query(
    profile: DatasetProfile,
    request: DatasetQueryRequest,
) -> dict[str, object]:
    datasource = get_datasource(profile.datasource_id)

    if not datasource or datasource.get("type") != "postgresql":
        return empty_result(request.query_type)

    try:
        plan = build_query_plan(profile, request)
        rows = execute_query_plan(datasource, plan)
    except (psycopg.Error, ValueError):
        return empty_result(request.query_type)

    if request.query_type == "metric":
        return normalize_metric_result(rows, plan.columns)

    if request.query_type == "trend":
        return normalize_trend_result(rows, plan.columns)

    if request.query_type == "breakdown":
        return normalize_breakdown_result(rows, plan.columns)

    return normalize_table_result(rows, plan.columns)


def execute_query_plan(datasource: dict, plan: SqlQueryPlan) -> list[tuple[Any, ...]]:
    username = datasource.get("username")

    if not username:
        return []

    with psycopg.connect(
        host=str(datasource.get("host") or ""),
        port=int(datasource.get("port") or 5432),
        dbname=str(datasource.get("database") or ""),
        user=str(username),
        sslmode="require" if bool(datasource.get("ssl")) else "prefer",
        connect_timeout=5,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(plan.query)
            return list(cursor.fetchall())


def normalize_metric_result(
    rows: list[tuple[Any, ...]], columns: list[str]
) -> dict[str, object]:
    value = rows[0][0] if rows and rows[0] else None

    return {"type": "metric", "value": normalize_number(value)}


def normalize_trend_result(
    rows: list[tuple[Any, ...]], columns: list[str]
) -> dict[str, object]:
    if len(columns) > 2:
        return normalize_series_result("trend", rows, columns, "x")

    points = []

    for row in rows:
        if len(row) < 2:
            continue

        points.append({"x": normalize_label(row[0]), "y": normalize_number(row[1])})

    return {"type": "trend", "points": points}


def normalize_breakdown_result(
    rows: list[tuple[Any, ...]], columns: list[str]
) -> dict[str, object]:
    if len(columns) > 2:
        return normalize_series_result("breakdown", rows, columns, "label")

    items = []

    for row in rows:
        if len(row) < 2:
            continue

        items.append(
            {"label": normalize_label(row[0]), "value": normalize_number(row[1])}
        )

    return {"type": "breakdown", "items": items}


def normalize_series_result(
    result_type: str,
    rows: list[tuple[Any, ...]],
    columns: list[str],
    label_key: str,
) -> dict[str, object]:
    series_names = columns[1:]
    items = []

    for row in rows:
        if len(row) < 2:
            continue

        item = {label_key: normalize_label(row[0])}
        for index, series_name in enumerate(series_names, start=1):
            item[series_name] = normalize_number(row[index]) if len(row) > index else None
        items.append(item)

    return {"type": result_type, "series": series_names, "items": items}


def normalize_table_result(
    rows: list[tuple[Any, ...]], columns: list[str]
) -> dict[str, object]:
    normalized_rows = [
        {column: normalize_cell(value) for column, value in zip(columns, row)}
        for row in rows
    ]

    return {"type": "table", "columns": columns, "rows": normalized_rows}


def empty_result(query_type: str) -> dict[str, object]:
    if query_type == "metric":
        return {"type": "metric", "value": None}

    if query_type == "trend":
        return {"type": "trend", "points": []}

    if query_type == "breakdown":
        return {"type": "breakdown", "items": []}

    return {"type": "table", "columns": [], "rows": []}


def normalize_number(value: object) -> float | int | None:
    if value is None:
        return None

    if isinstance(value, Decimal):
        number = float(value)
        return int(number) if number.is_integer() else number

    if isinstance(value, int | float):
        return value

    try:
        number = float(str(value))
    except ValueError:
        return None

    return int(number) if number.is_integer() else number


def normalize_label(value: object) -> str:
    if value is None:
        return ""

    return str(value)


def normalize_cell(value: object) -> object:
    if isinstance(value, Decimal):
        return normalize_number(value)

    if value is None or isinstance(value, str | int | float | bool):
        return value

    return str(value)
