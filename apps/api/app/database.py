import os
import uuid
from typing import Any, cast

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get(
    "BI_AGENT_DATABASE_URL",
    "postgresql://zhourukun@localhost:5432/bi-agent-local",
)

DatasourceTypeSeed = tuple[str, str, int, str, str, str, int]

DATASOURCE_TYPE_SEEDS: list[DatasourceTypeSeed] = [
    ("local-file", "本地文件", 10, "本地文件", "只支持 .csv、.xls、.xlsx", "file", 10),
    ("database", "数据库", 20, "MySQL", "自建 MySQL 数据库", "database", 10),
    ("database", "数据库", 20, "PostgreSQL", "自建 PostgreSQL 数据库", "database", 20),
    ("database", "数据库", 20, "SQL Server", "自建 SQL Server 数据库", "server", 30),
    ("database", "数据库", 20, "ClickHouse", "自建 ClickHouse 数据库", "server", 40),
    ("database", "数据库", 20, "Oracle", "自建 Oracle 数据库", "database", 50),
    ("database", "数据库", 20, "MongoDB", "自建 MongoDB 数据库", "database", 60),
    ("api-datasource", "API数据源", 30, "API数据源", "通过接口地址接入数据", "api", 10),
]


def get_connection(
    connection_url: str = DATABASE_URL,
) -> psycopg.Connection[tuple[Any, ...]]:
    return psycopg.connect(connection_url, connect_timeout=5)


def init_database() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS datasource_types (
                    id BIGSERIAL PRIMARY KEY,
                    category_key TEXT NOT NULL,
                    category_title TEXT NOT NULL,
                    category_sort INTEGER NOT NULL DEFAULT 0,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE
                );
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS datasources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    host TEXT,
                    port INTEGER,
                    database_name TEXT,
                    schema_name TEXT,
                    username TEXT,
                    password TEXT,
                    ssl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    owner TEXT NOT NULL DEFAULT 'zhourukun',
                    status TEXT NOT NULL DEFAULT 'ready',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS datasets (
                    id TEXT PRIMARY KEY,
                    datasource_id TEXT NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    source_schema TEXT,
                    source_table TEXT NOT NULL,
                    owner TEXT NOT NULL DEFAULT 'zhourukun',
                    status TEXT NOT NULL DEFAULT 'ready',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS dataset_fields (
                    id TEXT PRIMARY KEY,
                    dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
                    source_name TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    data_type TEXT NOT NULL,
                    ordinal_position INTEGER NOT NULL DEFAULT 0,
                    nullable BOOLEAN NOT NULL DEFAULT TRUE,
                    selected BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.executemany(
                """
                INSERT INTO datasource_types (
                    category_key,
                    category_title,
                    category_sort,
                    name,
                    description,
                    icon,
                    sort_order
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (name) DO UPDATE SET
                    category_key = EXCLUDED.category_key,
                    category_title = EXCLUDED.category_title,
                    category_sort = EXCLUDED.category_sort,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    sort_order = EXCLUDED.sort_order,
                    enabled = TRUE;
                """,
                DATASOURCE_TYPE_SEEDS,
            )


def list_datasource_type_categories() -> list[dict[str, object]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH categories AS (
                    SELECT
                        category_key,
                        category_title,
                        MIN(category_sort) AS category_sort,
                        JSONB_AGG(
                            JSONB_BUILD_OBJECT(
                                'name', name,
                                'description', description,
                                'icon', icon
                            )
                            ORDER BY sort_order ASC, id ASC
                        ) AS items
                    FROM datasource_types
                    WHERE enabled = TRUE
                    GROUP BY category_key, category_title
                )
                SELECT COALESCE(
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'key', category_key,
                            'title', category_title,
                            'items', items
                        )
                        ORDER BY category_sort ASC
                    ),
                    '[]'::JSONB
                )
                FROM categories;
                """
            )
            row = cursor.fetchone()

    return cast(list[dict[str, object]], row[0] if row else [])


def create_database_datasource(
    *,
    database_name: str,
    display_name: str,
    host: str,
    password: str,
    port: int,
    schema_name: str | None,
    ssl_enabled: bool,
    datasource_type: str,
    username: str,
) -> dict[str, object]:
    datasource_id = f"ds_{uuid.uuid4().hex}"

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO datasources (
                    id,
                    name,
                    type,
                    host,
                    port,
                    database_name,
                    schema_name,
                    username,
                    password,
                    ssl_enabled
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    datasource_id,
                    display_name,
                    datasource_type,
                    host,
                    port,
                    database_name,
                    schema_name,
                    username,
                    password,
                    ssl_enabled,
                ),
            )

    return {
        "database": database_name,
        "host": host,
        "id": datasource_id,
        "name": display_name,
        "schema": schema_name,
        "status": "ready",
        "type": datasource_type,
    }


def list_datasources() -> list[dict[str, object]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', id,
                            'name', name,
                            'type', type,
                            'status', status,
                            'owner', owner,
                            'updated_at', TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS'),
                            'database', database_name,
                            'schema', schema_name
                        )
                        ORDER BY updated_at DESC
                    ),
                    '[]'::JSONB
                )
                FROM datasources;
                """
            )
            row = cursor.fetchone()

    return cast(list[dict[str, object]], row[0] if row else [])


def get_datasource(datasource_id: str) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    name,
                    type,
                    host,
                    port,
                    database_name AS database,
                    schema_name AS schema,
                    username,
                    password,
                    ssl_enabled AS ssl
                FROM datasources
                WHERE id = %s;
                """,
                (datasource_id,),
            )
            row = cursor.fetchone()

    return dict(row) if row else None


def count_database_rows() -> list[tuple[str, int]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT table_name, row_count
                FROM (
                    SELECT 'datasource_types' AS table_name, COUNT(*) AS row_count
                    FROM datasource_types
                    UNION ALL
                    SELECT 'datasources', COUNT(*) FROM datasources
                    UNION ALL
                    SELECT 'datasets', COUNT(*) FROM datasets
                    UNION ALL
                    SELECT 'dataset_fields', COUNT(*) FROM dataset_fields
                ) table_counts
                ORDER BY table_name;
                """
            )
            rows = cursor.fetchall()

    return [(str(table_name), int(row_count)) for table_name, row_count in rows]
