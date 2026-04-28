import json
import os
import time
from collections.abc import Iterator

import psycopg
from psycopg import sql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import (
    create_database_datasource,
    get_datasource,
    init_database,
    list_datasources,
    list_datasource_type_categories,
)
from app.routers.uploads import router as uploads_router

app = FastAPI(title="BI Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(uploads_router)


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
            {"label": "智能体能力", "value": "5", "trend": "问数/解读/报告/搭建/搜索"},
            {"label": "大屏组件", "value": "6", "trend": "指标/图表/表格/文本"},
        ],
    }


@app.get("/api/agent/capabilities")
def agent_capabilities() -> dict[str, object]:
    return {
        "capabilities": [
            {
                "key": "qa",
                "name": "小Q问数",
                "description": "用自然语言查询指标和维度。",
            },
            {
                "key": "insight",
                "name": "小Q解读",
                "description": "解释异常波动、趋势和业务原因。",
            },
            {
                "key": "report",
                "name": "小Q报告",
                "description": "生成经营分析报告和摘要。",
            },
            {
                "key": "builder",
                "name": "小Q搭建",
                "description": "基于数据源生成大屏 JSON Spec。",
            },
            {
                "key": "search",
                "name": "小Q搜索",
                "description": "搜索数据资产、字段和指标。",
            },
        ],
        "prompts": [
            "基于销售数据生成一个经营分析大屏。",
            "分析最近 12 个月销售额变化趋势。",
            "找出订单量最高的区域和商品。",
        ],
    }


@app.get("/api/datasources")
def datasources() -> dict[str, object]:
    return {"items": list_datasources()}


@app.get("/api/datasource-types")
def datasource_types() -> dict[str, object]:
    return {"categories": list_datasource_type_categories()}


@app.get("/api/network/whitelist")
def network_whitelist() -> dict[str, object]:
    raw_items = os.environ.get("BI_AGENT_WHITELIST_IPS", "127.0.0.1")
    items = [item.strip() for item in raw_items.split(",") if item.strip()]

    return {"items": items}


@app.get("/api/screens")
def screens() -> dict[str, object]:
    return {
        "items": [
            {
                "id": "sales-dashboard",
                "name": "销售经营分析大屏",
                "status": "draft",
                "updated_at": "2026-04-27",
            },
            {
                "id": "growth-dashboard",
                "name": "增长运营大屏",
                "status": "preview",
                "updated_at": "2026-04-26",
            },
        ]
    }


class GenerateScreenRequest(BaseModel):
    prompt: str
    datasource_id: str = "sales_file"


class ChatRequest(BaseModel):
    message: str
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


def run_postgres_connection_test(
    payload: TestDatasourceConnectionRequest,
) -> tuple[bool, str]:
    if payload.type != "PostgreSQL":
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
        password=payload.password,
        port=payload.port,
        schema_name=payload.schema_name,
        ssl_enabled=payload.ssl,
        datasource_type=payload.type,
        username=payload.username,
    )

    return {"datasource": datasource, "message": "数据源创建成功。", "ok": True}


@app.get("/api/datasources/{datasource_id}/tables")
def datasource_tables(datasource_id: str) -> dict[str, object]:
    datasource = get_datasource(datasource_id)

    if not datasource:
        return {"items": []}

    username = datasource.get("username")
    password = datasource.get("password")

    if not username or not password:
        return {"items": []}

    schema_name = str(datasource.get("schema") or "public")

    try:
        with psycopg.connect(
            host=str(datasource.get("host")),
            port=int(datasource.get("port") or 5432),
            dbname=str(datasource.get("database")),
            user=str(username),
            password=str(password),
            sslmode="require" if datasource.get("ssl") else "prefer",
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
                items = [
                    {
                        "id": f"{table_schema}.{table_name}",
                        "name": table_name,
                        "schema": table_schema,
                        "remark": "",
                    }
                    for table_schema, table_name in cursor.fetchall()
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
    password = datasource.get("password")

    if not username or not password:
        return {"columns": [], "fields": [], "rows": []}

    schema_name, table_name = parse_table_id(
        table_id,
        str(datasource.get("schema") or "public"),
    )

    try:
        with psycopg.connect(
            host=str(datasource.get("host")),
            port=int(datasource.get("port") or 5432),
            dbname=str(datasource.get("database")),
            user=str(username),
            password=str(password),
            sslmode="require" if datasource.get("ssl") else "prefer",
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
                fields = [
                    {
                        "description": "-",
                        "name": column_name,
                        "type": data_type,
                    }
                    for column_name, data_type, _ordinal_position in cursor.fetchall()
                ]

                columns = [field["name"] for field in fields]
                preview_rows: list[dict[str, object]] = []

                if columns:
                    cursor.execute(
                        sql.SQL("SELECT * FROM {}.{} LIMIT 20").format(
                            sql.Identifier(schema_name),
                            sql.Identifier(table_name),
                        )
                    )
                    for row in cursor.fetchall():
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


def stream_agent_response(payload: ChatRequest) -> Iterator[str]:
    datasource = payload.datasource_id or "未选择数据源"
    chunks = [
        "分析完毕（用时13秒）\n\n",
        f"已基于「{datasource}」理解您的问题：{payload.message}\n\n",
        "在当前查询条件下，销售金额总和为 3968，月环比为 -26.59%，比上一期减少了 1437。\n\n",
        "上个月女装销售额的增速是多少？\n\n",
        "| 订单日期(month) | 本期销售金额 | 上月销售金额 | 销售金额(月环比差值) | 销售金额(月环比) |\n",
        "| --- | ---: | ---: | ---: | ---: |\n",
        "| 2026-03 | 3968 | 5405 | -1437 | -26.59% |\n\n",
        "回答已终止。",
    ]

    for chunk in chunks:
        yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
        time.sleep(0.18)

    yield "data: [DONE]\n\n"


@app.post("/api/agent/chat")
def agent_chat(payload: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_agent_response(payload),
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
