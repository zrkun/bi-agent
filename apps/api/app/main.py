import json
import os
import time
import uuid
from collections.abc import Iterator
from typing import Any

import psycopg
from psycopg import sql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_llm_config
from app.database import (
    create_database_datasource,
    create_dataset,
    create_local_file_items,
    delete_dataset,
    delete_datasource,
    delete_local_file_item,
    get_dataset_detail,
    get_datasource,
    get_local_file_item,
    init_database,
    list_datasources,
    list_datasets,
    list_datasource_type_categories,
    list_local_file_items,
    update_database_datasource,
    update_dataset,
    update_local_file_item,
)
from app.routers.uploads import router as uploads_router
from app.routers.screens import router as screens_router
from app.services.agent.graph import stream_agent_graph
from app.services.datasets.profile import build_dataset_profile
from app.services.datasets.query_executor import execute_dataset_query
from app.services.datasets.types import DatasetQueryRequest

app = FastAPI(title="BI Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads_router)
app.include_router(screens_router)


@app.on_event("startup")
def startup() -> None:
    init_database()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ping")
def ping(name: str = "world") -> dict[str, str]:
    return {
        "message": f"hello, {name}",
        "source": "fastapi",
    }


@app.get("/api/summary")
def summary() -> dict[str, object]:
    return {
        "title": "AI BI Platform",
        "description": "数据接入、智能分析、大屏生成与拖拽编辑的一体化 BI 工作台。",
        "metrics": [
            {"label": "数据源", "value": "3", "trend": "本地/API/数据库"},
            {"label": "智能体能力", "value": "2", "trend": "问数/搭建"},
            {"label": "大屏组件", "value": "6", "trend": "指标/图表/表格/文本"},
        ],
    }


@app.get("/api/agent/capabilities")
def agent_capabilities() -> dict[str, object]:
    llm_config = get_llm_config()

    return {
        "capabilities": [
            {
                "key": "qa",
                "name": "小Q问数",
                "description": "用自然语言查询指标和维度。",
            },
            {
                "key": "builder",
                "name": "小Q搭建",
                "description": "基于数据集生成大屏预览。",
            },
        ],
        "prompts": [
            "基于销售数据生成一个经营分析大屏。",
            "分析最近 12 个月销售额变化趋势。",
            "找出订单量最高的区域和商品。",
        ],
        "llm": {
            "enabled": llm_config.enabled,
            "model": llm_config.model,
            "provider": llm_config.provider,
        },
    }


@app.get("/api/datasources")
def datasources() -> dict[str, object]:
    return {"items": list_datasources()}


@app.get("/api/datasource-types")
def datasource_types() -> dict[str, object]:
    return {"categories": list_datasource_type_categories()}


@app.get("/api/local-files")
def local_files() -> dict[str, object]:
    return {"items": list_local_file_items()}


@app.get("/api/network/whitelist")
def network_whitelist() -> dict[str, object]:
    raw_items = os.environ.get("BI_AGENT_WHITELIST_IPS", "127.0.0.1")
    items = [item.strip() for item in raw_items.split(",") if item.strip()]

    return {"items": items}


class GenerateScreenRequest(BaseModel):
    prompt: str
    datasource_id: str = "sales_file"


class ChatRequest(BaseModel):
    message: str
    dataset_id: str | None = None
    datasource_id: str | None = None
    capability: str = "qa"


class TestDatasourceConnectionRequest(BaseModel):
    type: str
    host: str
    port: int
    database: str
    schema_name: str | None = None
    username: str
    password: str
    ssl: bool = False


class CreateDatabaseDatasourceRequest(TestDatasourceConnectionRequest):
    display_name: str


class LocalFileField(BaseModel):
    display_name: str | None = None
    name: str | None = None
    source_name: str | None = None
    type: str


class LocalFileSheet(BaseModel):
    display_name: str
    fields: list[LocalFileField]
    header_row: int = 1
    sheet_name: str


class CreateLocalFilesRequest(BaseModel):
    bucket: str | None = None
    content_type: str | None = None
    file_name: str
    file_size: int | None = None
    object_key: str | None = None
    sheets: list[LocalFileSheet]


class UpdateLocalFileRequest(BaseModel):
    display_name: str
    fields: list[LocalFileField]
    header_row: int = 1


class DatasetFieldRequest(BaseModel):
    aggregation: str | None = None
    data_type: str
    display_name: str
    expression: dict[str, str] | None = None
    field_kind: str = "source"
    selected: bool = True
    semantic_type: str = "dimension"
    source_name: str


class DatasetRelationshipConditionRequest(BaseModel):
    left_field: str
    operator: str = "="
    right_field: str


class DatasetRelationshipRequest(BaseModel):
    conditions: list[DatasetRelationshipConditionRequest] = []
    join_type: str = "left"
    left_table: str
    right_table: str


class CreateDatasetRequest(BaseModel):
    datasource_id: str
    fields: list[DatasetFieldRequest]
    name: str
    relationships: list[DatasetRelationshipRequest] = []
    source_tables: list[str]
    source_type: str


class DatasetPreviewFieldRequest(BaseModel):
    data_type: str
    display_name: str
    selected: bool = True
    source_field: str
    source_table: str


class DatasetPreviewRequest(BaseModel):
    datasource_id: str
    fields: list[DatasetPreviewFieldRequest]
    relationships: list[DatasetRelationshipRequest] = []
    tables: list[str]


@app.get("/api/local-files/{item_id}")
def local_file_detail(item_id: str) -> dict[str, object]:
    item = get_local_file_item(item_id)

    if not item:
        return {"item": None}

    return {"item": item}


@app.get("/api/datasets")
def datasets() -> dict[str, object]:
    return {"items": list_datasets()}


@app.get("/api/datasets/{dataset_id}/profile")
def dataset_profile(dataset_id: str) -> dict[str, object]:
    return {"item": build_dataset_profile(dataset_id).model_dump()}


@app.post("/api/datasets/{dataset_id}/query")
def dataset_query(dataset_id: str, payload: DatasetQueryRequest) -> dict[str, object]:
    profile = build_dataset_profile(dataset_id)

    return execute_dataset_query(profile, payload)


@app.get("/api/datasets/{dataset_id}")
def dataset_detail(dataset_id: str) -> dict[str, object]:
    return {"item": get_dataset_detail(dataset_id)}


@app.delete("/api/datasets/{dataset_id}")
def remove_dataset(dataset_id: str) -> dict[str, object]:
    deleted = delete_dataset(dataset_id)

    if not deleted:
        return {"message": "数据集不存在或已删除。", "ok": False}

    return {"message": "数据集删除成功。", "ok": True}


@app.post("/api/datasets")
def create_dataset_endpoint(payload: CreateDatasetRequest) -> dict[str, object]:
    return save_dataset(payload)


@app.put("/api/datasets/{dataset_id}")
def update_dataset_endpoint(
    dataset_id: str, payload: CreateDatasetRequest
) -> dict[str, object]:
    return save_dataset(payload, dataset_id)


def save_dataset(
    payload: CreateDatasetRequest,
    dataset_id: str | None = None,
) -> dict[str, object]:
    dataset_name = payload.name.strip()

    if not dataset_name:
        return {"dataset": None, "message": "数据集名称不能为空。", "ok": False}

    source_tables = [item.strip() for item in payload.source_tables if item.strip()]

    if not payload.datasource_id.strip() or not source_tables:
        return {"dataset": None, "message": "数据集来源不能为空。", "ok": False}

    if len(source_tables) > 1 and not payload.relationships:
        return {
            "dataset": None,
            "message": "多表数据集请至少配置一条关联关系。",
            "ok": False,
        }

    selected_fields = [field for field in payload.fields if field.selected]

    if not selected_fields:
        return {"dataset": None, "message": "请至少选择一个字段。", "ok": False}

    field_names = [field.display_name.strip() for field in selected_fields]
    duplicate_field_name = next(
        (
            field_name
            for index, field_name in enumerate(field_names)
            if field_name and field_names.index(field_name) != index
        ),
        "",
    )

    if duplicate_field_name:
        return {
            "dataset": None,
            "message": f"字段名称不能重复：{duplicate_field_name}。",
            "ok": False,
        }

    if any(
        item.get("name") == dataset_name and item.get("id") != dataset_id
        for item in list_datasets()
    ):
        return {
            "dataset": None,
            "message": f"数据集名称已存在：{dataset_name}。",
            "ok": False,
        }

    dataset_payload = {
        "datasource_id": payload.datasource_id.strip(),
        "fields": [field.model_dump() for field in payload.fields],
        "name": dataset_name,
        "relationships": [
            relationship.model_dump() for relationship in payload.relationships
        ],
        "source_tables": source_tables,
        "source_type": payload.source_type,
    }
    dataset = (
        update_dataset(dataset_id=dataset_id, **dataset_payload)
        if dataset_id
        else create_dataset(**dataset_payload)
    )

    if not dataset:
        return {"dataset": None, "message": "数据集不存在。", "ok": False}

    return {
        "dataset": dataset,
        "message": "数据集更新成功。" if dataset_id else "数据集创建成功。",
        "ok": True,
    }


@app.post("/api/local-files")
def create_local_files(payload: CreateLocalFilesRequest) -> dict[str, object]:
    if not payload.file_name.strip():
        return {"items": [], "message": "文件名称不能为空。", "ok": False}

    if not payload.sheets:
        return {"items": [], "message": "未解析到可保存的 Sheet。", "ok": False}

    display_names = [
        (sheet.display_name or sheet.sheet_name).strip() for sheet in payload.sheets
    ]
    duplicate_names = sorted(
        {name for name in display_names if name and display_names.count(name) > 1}
    )

    if duplicate_names:
        return {
            "items": [],
            "message": f"表名称不能重复：{duplicate_names[0]}。",
            "ok": False,
        }

    existing_names = {
        str(item.get("display_name") or "").strip() for item in list_local_file_items()
    }
    conflicted_name = next(
        (name for name in display_names if name in existing_names), ""
    )

    if conflicted_name:
        return {
            "items": [],
            "message": f"表名称已存在：{conflicted_name}。",
            "ok": False,
        }

    items = create_local_file_items(
        bucket=payload.bucket,
        content_type=payload.content_type,
        file_name=payload.file_name.strip(),
        file_size=payload.file_size,
        object_key=payload.object_key,
        sheets=[sheet.model_dump() for sheet in payload.sheets],
    )

    return {"items": items, "message": "本地文件保存成功。", "ok": True}


@app.put("/api/local-files/{item_id}")
def update_local_file(
    item_id: str, payload: UpdateLocalFileRequest
) -> dict[str, object]:
    display_name = payload.display_name.strip()

    if not display_name:
        return {"item": None, "message": "展示名称不能为空。", "ok": False}

    if payload.header_row < 1:
        return {"item": None, "message": "标题行必须大于 0。", "ok": False}

    existing_names = {
        str(item.get("display_name") or "").strip()
        for item in list_local_file_items()
        if item.get("id") != item_id
    }

    if display_name in existing_names:
        return {"item": None, "message": f"表名称已存在：{display_name}。", "ok": False}

    item = update_local_file_item(
        display_name=display_name,
        fields=[field.model_dump() for field in payload.fields],
        header_row=payload.header_row,
        item_id=item_id,
    )

    if not item:
        return {"item": None, "message": "本地文件不存在。", "ok": False}

    return {"item": item, "message": "本地文件配置更新成功。", "ok": True}


@app.delete("/api/local-files/{item_id}")
def remove_local_file(item_id: str) -> dict[str, object]:
    deleted = delete_local_file_item(item_id)

    if not deleted:
        return {"message": "本地文件不存在。", "ok": False}

    return {"message": "本地文件删除成功。", "ok": True}


def get_string(value: object, fallback: str = "") -> str:
    if value is None:
        return fallback

    return str(value)


def get_int(value: object, fallback: int) -> int:
    if value is None:
        return fallback

    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def get_bool(value: object) -> bool:
    return bool(value)


def run_postgres_connection_test(
    payload: TestDatasourceConnectionRequest,
) -> tuple[bool, str]:
    if payload.type != "postgresql":
        return False, f"暂不支持 {payload.type} 的连接测试。"

    try:
        with psycopg.connect(
            host=payload.host,
            port=payload.port,
            dbname=payload.database,
            user=payload.username,
            password=payload.password,
            sslmode="require" if payload.ssl else "prefer",
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                if payload.schema_name:
                    cursor.execute(
                        """
                        SELECT 1
                        FROM information_schema.schemata
                        WHERE schema_name = %s;
                        """,
                        (payload.schema_name,),
                    )

                    if not cursor.fetchone():
                        return (
                            False,
                            f"连接测试失败：Schema {payload.schema_name} 不存在。",
                        )
                else:
                    cursor.execute("SELECT 1;")
    except psycopg.OperationalError as error:
        detail = str(error).strip().splitlines()[0]
        if "timeout" in detail.lower():
            return False, "连接测试超时，请检查地址、端口和网络。"

        return False, f"连接测试失败：{detail}"
    except TimeoutError:
        return False, "连接测试超时，请检查地址、端口和网络。"
    except psycopg.Error as error:
        detail = str(error).strip().splitlines()[0]
        return False, f"连接测试失败：{detail}"

    return True, "连接测试成功。"


@app.post("/api/datasources/test-connection")
def test_datasource_connection(
    payload: TestDatasourceConnectionRequest,
) -> dict[str, object]:
    ok, message = run_postgres_connection_test(payload)

    return {"ok": ok, "message": message}


@app.post("/api/datasources")
def create_datasource(payload: CreateDatabaseDatasourceRequest) -> dict[str, object]:
    ok, message = run_postgres_connection_test(payload)

    if not ok:
        return {"ok": False, "message": message}

    datasource = create_database_datasource(
        database_name=payload.database,
        display_name=payload.display_name,
        host=payload.host,
        port=payload.port,
        schema_name=payload.schema_name,
        ssl_enabled=payload.ssl,
        datasource_type=payload.type,
        username=payload.username,
    )

    return {"datasource": datasource, "message": "数据源创建成功。", "ok": True}


@app.put("/api/datasources/{datasource_id}")
def update_datasource(
    datasource_id: str,
    payload: CreateDatabaseDatasourceRequest,
) -> dict[str, object]:
    ok, message = run_postgres_connection_test(payload)

    if not ok:
        return {"ok": False, "message": message}

    datasource = update_database_datasource(
        database_name=payload.database,
        datasource_id=datasource_id,
        display_name=payload.display_name,
        host=payload.host,
        port=payload.port,
        schema_name=payload.schema_name,
        ssl_enabled=payload.ssl,
        datasource_type=payload.type,
        username=payload.username,
    )

    if not datasource:
        return {"ok": False, "message": "数据源不存在。"}

    return {"datasource": datasource, "message": "数据源更新成功。", "ok": True}


@app.get("/api/datasources/{datasource_id}")
def datasource_detail(datasource_id: str) -> dict[str, object]:
    datasource = get_datasource(datasource_id)

    if not datasource:
        return {"datasource": None}

    return {"datasource": datasource}


@app.delete("/api/datasources/{datasource_id}")
def remove_datasource(datasource_id: str) -> dict[str, object]:
    deleted = delete_datasource(datasource_id)

    if not deleted:
        return {"message": "数据源不存在。", "ok": False}

    return {"message": "数据源删除成功。", "ok": True}


@app.get("/api/datasources/{datasource_id}/tables")
def datasource_tables(datasource_id: str) -> dict[str, object]:
    datasource = get_datasource(datasource_id)

    if not datasource:
        return {"items": []}

    username = datasource.get("username")

    if not username:
        return {"items": []}

    schema_name = str(datasource.get("schema") or "public")
    items: list[dict[str, object]] = []

    try:
        with psycopg.connect(
            host=get_string(datasource.get("host")),
            port=get_int(datasource.get("port"), 5432),
            dbname=get_string(datasource.get("database")),
            user=get_string(username),
            sslmode="require" if get_bool(datasource.get("ssl")) else "prefer",
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT table_schema, table_name
                    FROM information_schema.tables
                    WHERE table_schema = %s
                        AND table_type = 'BASE TABLE'
                    ORDER BY table_name;
                    """,
                    (schema_name,),
                )
                table_rows = cursor.fetchall()
                items = [
                    {
                        "id": f"{table_schema}.{table_name}",
                        "name": table_name,
                        "schema": table_schema,
                        "remark": "",
                    }
                    for table_schema, table_name in table_rows
                ]
    except psycopg.Error:
        return {"items": []}

    return {"items": items}


def parse_table_id(table_id: str, default_schema: str) -> tuple[str, str]:
    if "." not in table_id:
        return default_schema, table_id

    schema_name, table_name = table_id.split(".", 1)
    return schema_name or default_schema, table_name


@app.get("/api/datasources/{datasource_id}/tables/{table_id}/preview")
def datasource_table_preview(datasource_id: str, table_id: str) -> dict[str, object]:
    datasource = get_datasource(datasource_id)

    if not datasource:
        return {"columns": [], "fields": [], "rows": []}

    username = datasource.get("username")

    if not username:
        return {"columns": [], "fields": [], "rows": []}

    schema_name, table_name = parse_table_id(
        table_id,
        str(datasource.get("schema") or "public"),
    )
    columns: list[str] = []
    fields: list[dict[str, str]] = []
    preview_rows: list[dict[str, object]] = []

    try:
        with psycopg.connect(
            host=get_string(datasource.get("host")),
            port=get_int(datasource.get("port"), 5432),
            dbname=get_string(datasource.get("database")),
            user=get_string(username),
            sslmode="require" if get_bool(datasource.get("ssl")) else "prefer",
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        column_name,
                        data_type,
                        ordinal_position
                    FROM information_schema.columns
                    WHERE table_schema = %s
                        AND table_name = %s
                    ORDER BY ordinal_position;
                    """,
                    (schema_name, table_name),
                )
                field_rows = cursor.fetchall()
                fields = [
                    {
                        "description": "-",
                        "name": get_string(column_name),
                        "type": get_string(data_type),
                    }
                    for column_name, data_type, _ordinal_position in field_rows
                ]

                columns = [field["name"] for field in fields]

                if columns:
                    cursor.execute(
                        sql.SQL("SELECT * FROM {}.{} LIMIT 20").format(
                            sql.Identifier(schema_name),
                            sql.Identifier(table_name),
                        )
                    )
                    preview_result_rows: list[tuple[Any, ...]] = cursor.fetchall()
                    for row in preview_result_rows:
                        preview_rows.append(
                            {
                                column: "" if value is None else str(value)
                                for column, value in zip(columns, row)
                            }
                        )
    except psycopg.Error:
        return {"columns": [], "fields": [], "rows": []}

    return {
        "columns": columns,
        "fields": fields,
        "rows": preview_rows,
    }


@app.post("/api/datasets/preview")
def dataset_preview(payload: DatasetPreviewRequest) -> dict[str, object]:
    datasource = get_datasource(payload.datasource_id)

    if not datasource or datasource.get("type") != "postgresql":
        return {"columns": [], "rows": []}

    username = datasource.get("username")

    if not username or not payload.tables:
        return {"columns": [], "rows": []}

    default_schema = str(datasource.get("schema") or "public")
    selected_fields = [field for field in payload.fields if field.selected]

    if not selected_fields:
        return {"columns": [], "rows": []}

    table_aliases = {
        table_id: f"t{index}" for index, table_id in enumerate(payload.tables)
    }
    join_type_map = {
        "full": sql.SQL("FULL JOIN"),
        "inner": sql.SQL("INNER JOIN"),
        "left": sql.SQL("LEFT JOIN"),
        "right": sql.SQL("RIGHT JOIN"),
    }

    def table_reference(table_id: str) -> sql.Composed:
        schema_name, table_name = parse_table_id(table_id, default_schema)

        return sql.SQL("{}.{}").format(
            sql.Identifier(schema_name), sql.Identifier(table_name)
        )

    from_table = payload.tables[0]
    query_parts: list[sql.Composable] = [
        sql.SQL("SELECT "),
        sql.SQL(", ").join(
            sql.SQL("{}.{} AS {}").format(
                sql.Identifier(table_aliases[field.source_table]),
                sql.Identifier(field.source_field),
                sql.Identifier(field.display_name),
            )
            for field in selected_fields
            if field.source_table in table_aliases
        ),
        sql.SQL(" FROM "),
        table_reference(from_table),
        sql.SQL(" AS "),
        sql.Identifier(table_aliases[from_table]),
    ]

    for relationship in payload.relationships:
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

    query_parts.append(sql.SQL(" LIMIT 20"))
    columns = [field.display_name for field in selected_fields]
    rows: list[dict[str, object]] = []

    try:
        with psycopg.connect(
            host=get_string(datasource.get("host")),
            port=get_int(datasource.get("port"), 5432),
            dbname=get_string(datasource.get("database")),
            user=get_string(username),
            sslmode="require" if get_bool(datasource.get("ssl")) else "prefer",
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.Composed(query_parts))
                for row in cursor.fetchall():
                    rows.append(
                        {
                            column: "" if value is None else str(value)
                            for column, value in zip(columns, row)
                        }
                    )
    except (KeyError, psycopg.Error):
        return {"columns": columns, "rows": []}

    return {"columns": columns, "rows": rows}


def stream_agent_events(payload: ChatRequest) -> Iterator[str]:
    run_id = f"run_{uuid.uuid4().hex}"
    session_id = f"ses_{uuid.uuid4().hex}"
    sequence = 0
    started_at = time.monotonic()

    def emit(event_type: str, event_payload: dict[str, object]) -> str:
        nonlocal sequence
        sequence += 1
        event = {
            "eventId": f"evt_{uuid.uuid4().hex}",
            "runId": run_id,
            "sessionId": session_id,
            "type": event_type,
            "sequence": sequence,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "payload": event_payload,
        }
        return f"event: {event_type}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"

    for event in stream_agent_graph(
        {
            "capability": payload.capability,
            "dataset_id": payload.dataset_id,
            "message": payload.message,
        }
    ):
        event_type = str(event.get("type") or "run.failed")
        event_payload = (
            event.get("payload") if isinstance(event.get("payload"), dict) else {}
        )

        if event_type == "run.completed":
            event_payload = {
                **event_payload,
                "durationMs": int((time.monotonic() - started_at) * 1000),
            }

        if event_type == "answer.delta":
            time.sleep(0.08)

        yield emit(event_type, event_payload)


@app.post("/api/agent/chat")
def agent_chat(payload: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_agent_events(payload),
        media_type="text/event-stream",
    )


@app.post("/api/agent/runs")
def agent_runs(payload: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_agent_events(payload),
        media_type="text/event-stream",
    )


@app.post("/api/agent/generate-screen")
def generate_screen(payload: GenerateScreenRequest) -> dict[str, object]:
    return {
        "message": "已生成大屏 JSON Spec 草稿。",
        "datasource_id": payload.datasource_id,
        "spec": {
            "root": "dashboard-root",
            "elements": {
                "dashboard-root": {
                    "type": "DashboardCanvas",
                    "props": {
                        "title": "销售经营分析大屏",
                        "width": 1920,
                        "height": 1080,
                    },
                    "children": ["metric-total-sales", "chart-monthly-trend"],
                },
                "metric-total-sales": {
                    "type": "MetricCard",
                    "props": {
                        "title": "销售总额",
                        "sourceId": payload.datasource_id,
                        "measure": "sales_amount",
                        "aggregation": "sum",
                        "layout": {"x": 40, "y": 80, "w": 320, "h": 140},
                    },
                    "children": [],
                },
                "chart-monthly-trend": {
                    "type": "LineChart",
                    "props": {
                        "title": "月度销售趋势",
                        "sourceId": payload.datasource_id,
                        "dimension": "month",
                        "measure": "sales_amount",
                        "layout": {"x": 400, "y": 80, "w": 680, "h": 320},
                    },
                    "children": [],
                },
            },
        },
    }
