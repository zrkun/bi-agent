import os
import uuid
from typing import Any, cast

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

DATABASE_URL = os.environ.get(
    "BI_AGENT_DATABASE_URL",
    "postgresql://zhourukun@localhost:5432/bi-agent-local",
)

DatasourceTypeSeed = tuple[str, str, int, str, str, str, str, int]

DATASOURCE_TYPE_SEEDS: list[DatasourceTypeSeed] = [
    (
        "local-file",
        "本地文件",
        10,
        "local-file",
        "本地文件",
        "只支持 .csv、.xls、.xlsx",
        "file",
        10,
    ),
    ("database", "数据库", 20, "mysql", "MySQL", "自建 MySQL 数据库", "database", 10),
    (
        "database",
        "数据库",
        20,
        "postgresql",
        "PostgreSQL",
        "自建 PostgreSQL 数据库",
        "database",
        20,
    ),
    (
        "database",
        "数据库",
        20,
        "sqlserver",
        "SQL Server",
        "自建 SQL Server 数据库",
        "server",
        30,
    ),
    (
        "database",
        "数据库",
        20,
        "clickhouse",
        "ClickHouse",
        "自建 ClickHouse 数据库",
        "server",
        40,
    ),
    (
        "database",
        "数据库",
        20,
        "oracle",
        "Oracle",
        "自建 Oracle 数据库",
        "database",
        50,
    ),
    (
        "database",
        "数据库",
        20,
        "mongodb",
        "MongoDB",
        "自建 MongoDB 数据库",
        "database",
        60,
    ),
    (
        "api-datasource",
        "API数据源",
        30,
        "api",
        "API数据源",
        "通过接口地址接入数据",
        "api",
        10,
    ),
]


def get_connection(
    connection_url: str = DATABASE_URL,
) -> psycopg.Connection[tuple[Any, ...]]:
    return psycopg.connect(connection_url, connect_timeout=5)


def normalize_dataset_field_type(value: object) -> str:
    normalized = str(value or "text").strip().lower()

    if (
        "date" in normalized
        or "time" in normalized
        or normalized in {"timestamp", "timestamptz"}
    ):
        return "date"

    if (
        "int" in normalized
        or "numeric" in normalized
        or "decimal" in normalized
        or "double" in normalized
        or "real" in normalized
        or "float" in normalized
        or normalized in {"number", "serial", "bigserial"}
    ):
        return "number"

    return "text"


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
                    type TEXT NOT NULL,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    enabled BOOLEAN NOT NULL DEFAULT TRUE
                );
                """
            )
            cursor.execute(
                "ALTER TABLE datasource_types ADD COLUMN IF NOT EXISTS type TEXT;"
            )
            cursor.execute(
                """
                UPDATE datasource_types
                SET type = CASE name
                    WHEN '本地文件' THEN 'local-file'
                    WHEN 'MySQL' THEN 'mysql'
                    WHEN 'PostgreSQL' THEN 'postgresql'
                    WHEN 'SQL Server' THEN 'sqlserver'
                    WHEN 'ClickHouse' THEN 'clickhouse'
                    WHEN 'Oracle' THEN 'oracle'
                    WHEN 'MongoDB' THEN 'mongodb'
                    WHEN 'API数据源' THEN 'api'
                    ELSE type
                END
                WHERE type IS NULL;
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
                    datasource_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    source_type TEXT NOT NULL DEFAULT 'database',
                    source_tables JSONB NOT NULL DEFAULT '[]'::JSONB,
                    relationships JSONB NOT NULL DEFAULT '[]'::JSONB,
                    owner TEXT NOT NULL DEFAULT 'zhourukun',
                    status TEXT NOT NULL DEFAULT 'ready',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute("DROP TABLE IF EXISTS screen_drafts;")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS screens (
                    id TEXT PRIMARY KEY,
                    dataset_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    prompt TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'draft',
                    spec JSONB NOT NULL,
                    owner TEXT NOT NULL DEFAULT 'zhourukun',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute("ALTER TABLE datasources DROP COLUMN IF EXISTS password;")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS dataset_fields (
                    id TEXT PRIMARY KEY,
                    dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
                    source_name TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    data_type TEXT NOT NULL,
                    ordinal_position INTEGER NOT NULL DEFAULT 0,
                    selected BOOLEAN NOT NULL DEFAULT TRUE,
                    semantic_type TEXT NOT NULL DEFAULT 'dimension',
                    aggregation TEXT,
                    config JSONB NOT NULL DEFAULT '{}'::JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'database';"
            )
            cursor.execute(
                "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS source_tables JSONB NOT NULL DEFAULT '[]'::JSONB;"
            )
            cursor.execute(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'datasets'
                          AND column_name = 'source_table'
                    ) THEN
                        UPDATE datasets
                        SET source_tables = TO_JSONB(
                            ARRAY_REMOVE(STRING_TO_ARRAY(COALESCE(source_table, ''), ','), '')
                        )
                        WHERE source_tables = '[]'::JSONB AND COALESCE(source_table, '') <> '';
                    END IF;
                END $$;
                """
            )
            cursor.execute("ALTER TABLE datasets DROP COLUMN IF EXISTS source_schema;")
            cursor.execute("ALTER TABLE datasets DROP COLUMN IF EXISTS source_table;")
            cursor.execute(
                """
                UPDATE datasets
                SET source_type = CASE
                    WHEN datasource_id = 'local-file' THEN 'local-file'
                    ELSE 'database'
                END
                WHERE source_type IS NULL OR source_type = '';
                """
            )
            cursor.execute(
                "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS relationships JSONB NOT NULL DEFAULT '[]'::JSONB;"
            )
            cursor.execute(
                "ALTER TABLE dataset_fields ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB;"
            )
            cursor.execute(
                """
                DO $$
                DECLARE
                    constraint_name TEXT;
                BEGIN
                    SELECT tc.constraint_name
                    INTO constraint_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.table_name = 'datasets'
                      AND tc.constraint_type = 'FOREIGN KEY'
                      AND kcu.column_name = 'datasource_id'
                    LIMIT 1;

                    IF constraint_name IS NOT NULL THEN
                        EXECUTE format('ALTER TABLE datasets DROP CONSTRAINT %I', constraint_name);
                    END IF;
                END $$;
                """
            )
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS datasets_name_unique ON datasets (name);"
            )
            cursor.execute(
                "ALTER TABLE dataset_fields ADD COLUMN IF NOT EXISTS semantic_type TEXT NOT NULL DEFAULT 'dimension';"
            )
            cursor.execute(
                "ALTER TABLE dataset_fields ADD COLUMN IF NOT EXISTS aggregation TEXT;"
            )
            cursor.execute("ALTER TABLE dataset_fields DROP COLUMN IF EXISTS nullable;")
            cursor.execute(
                "ALTER TABLE dataset_fields DROP COLUMN IF EXISTS sample_values;"
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS local_file_items (
                    id TEXT PRIMARY KEY,
                    file_name TEXT NOT NULL,
                    bucket TEXT,
                    object_key TEXT,
                    content_type TEXT,
                    file_size BIGINT,
                    sheet_name TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    header_row INTEGER NOT NULL DEFAULT 1,
                    fields JSONB NOT NULL DEFAULT '[]'::JSONB,
                    owner TEXT NOT NULL DEFAULT 'zhourukun',
                    status TEXT NOT NULL DEFAULT 'ready',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cursor.execute(
                "ALTER TABLE local_file_items ADD COLUMN IF NOT EXISTS bucket TEXT;"
            )
            cursor.execute(
                "ALTER TABLE local_file_items ADD COLUMN IF NOT EXISTS object_key TEXT;"
            )
            cursor.execute(
                "ALTER TABLE local_file_items ADD COLUMN IF NOT EXISTS content_type TEXT;"
            )
            cursor.execute(
                "ALTER TABLE local_file_items ADD COLUMN IF NOT EXISTS file_size BIGINT;"
            )
            cursor.execute(
                "ALTER TABLE local_file_items ADD COLUMN IF NOT EXISTS header_row INTEGER NOT NULL DEFAULT 1;"
            )
            cursor.execute(
                "ALTER TABLE local_file_items DROP COLUMN IF EXISTS preview_rows;"
            )
            cursor.executemany(
                """
                INSERT INTO datasource_types (
                    category_key,
                    category_title,
                    category_sort,
                    type,
                    name,
                    description,
                    icon,
                    sort_order
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (name) DO UPDATE SET
                    category_key = EXCLUDED.category_key,
                    category_title = EXCLUDED.category_title,
                    category_sort = EXCLUDED.category_sort,
                    type = EXCLUDED.type,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    sort_order = EXCLUDED.sort_order,
                    enabled = TRUE;
                """,
                DATASOURCE_TYPE_SEEDS,
            )
            cursor.execute(
                "ALTER TABLE datasource_types ALTER COLUMN type SET NOT NULL;"
            )
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS datasource_types_type_unique ON datasource_types (type);"
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
                                'type', type,
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
                    ssl_enabled
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
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


def update_database_datasource(
    *,
    database_name: str,
    datasource_id: str,
    display_name: str,
    host: str,
    port: int,
    schema_name: str | None,
    ssl_enabled: bool,
    datasource_type: str,
    username: str,
) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE datasources
                SET
                    name = %s,
                    type = %s,
                    host = %s,
                    port = %s,
                    database_name = %s,
                    schema_name = %s,
                    username = %s,
                    ssl_enabled = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (
                    display_name,
                    datasource_type,
                    host,
                    port,
                    database_name,
                    schema_name,
                    username,
                    ssl_enabled,
                    datasource_id,
                ),
            )
            updated_count = cursor.rowcount

    if updated_count == 0:
        return None

    return {
        "database": database_name,
        "host": host,
        "id": datasource_id,
        "name": display_name,
        "schema": schema_name,
        "status": "ready",
        "type": datasource_type,
    }


def delete_datasource(datasource_id: str) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM datasources WHERE id = %s;",
                (datasource_id,),
            )
            deleted_count = cursor.rowcount

    return deleted_count > 0


def delete_dataset(dataset_id: str) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM datasets WHERE id = %s;",
                (dataset_id,),
            )
            deleted_count = cursor.rowcount

    return deleted_count > 0


def delete_local_file_item(item_id: str) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM local_file_items WHERE id = %s;",
                (item_id,),
            )
            deleted_count = cursor.rowcount

    return deleted_count > 0


def update_local_file_item(
    *,
    display_name: str,
    fields: list[dict[str, object]],
    header_row: int,
    item_id: str,
) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE local_file_items
                SET
                    display_name = %s,
                    fields = %s,
                    header_row = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (display_name, Jsonb(fields), header_row, item_id),
            )
            updated_count = cursor.rowcount

    if updated_count == 0:
        return None

    return {
        "display_name": display_name,
        "fields": fields,
        "header_row": header_row,
        "id": item_id,
    }


def list_datasets() -> list[dict[str, object]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', d.id,
                            'name', d.name,
                            'datasource_id', d.datasource_id,
                            'source_type', d.source_type,
                            'source_tables', d.source_tables,
                            'relationships', d.relationships,
                            'owner', d.owner,
                            'status', d.status,
                            'field_count', COALESCE(field_stats.field_count, 0),
                            'dimension_count', COALESCE(field_stats.dimension_count, 0),
                            'measure_count', COALESCE(field_stats.measure_count, 0),
                            'time_count', COALESCE(field_stats.time_count, 0),
                            'updated_at', TO_CHAR(d.updated_at, 'YYYY/MM/DD HH24:MI:SS')
                        )
                        ORDER BY d.updated_at DESC
                    ),
                    '[]'::JSONB
                )
                FROM datasets d
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) AS field_count,
                        COUNT(*) FILTER (WHERE semantic_type = 'dimension') AS dimension_count,
                        COUNT(*) FILTER (WHERE semantic_type = 'measure') AS measure_count,
                        COUNT(*) FILTER (WHERE semantic_type = 'time') AS time_count
                    FROM dataset_fields
                    WHERE dataset_id = d.id AND selected = TRUE
                ) field_stats ON TRUE;
                """
            )
            row = cursor.fetchone()

    return cast(list[dict[str, object]], row[0] if row else [])


def get_dataset_detail(dataset_id: str) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT JSONB_BUILD_OBJECT(
                    'id', d.id,
                    'name', d.name,
                    'datasource_id', d.datasource_id,
                    'source_type', d.source_type,
                    'source_tables', d.source_tables,
                    'relationships', d.relationships,
                    'owner', d.owner,
                    'status', d.status,
                    'updated_at', TO_CHAR(d.updated_at, 'YYYY/MM/DD HH24:MI:SS'),
                    'fields', COALESCE(fields.items, '[]'::JSONB)
                )
                FROM datasets d
                LEFT JOIN LATERAL (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', df.id,
                            'source_name', df.source_name,
                            'display_name', df.display_name,
                            'data_type', df.data_type,
                            'selected', df.selected,
                            'semantic_type', df.semantic_type,
                            'aggregation', df.aggregation,
                            'config', df.config
                        )
                        ORDER BY df.ordinal_position ASC
                    ) AS items
                    FROM dataset_fields df
                    WHERE df.dataset_id = d.id
                ) fields ON TRUE
                WHERE d.id = %s
                LIMIT 1;
                """,
                (dataset_id,),
            )
            row = cursor.fetchone()

    return cast(dict[str, object] | None, row[0] if row else None)


def create_dataset(
    *,
    datasource_id: str,
    fields: list[dict[str, object]],
    name: str,
    relationships: list[dict[str, object]],
    source_tables: list[str],
    source_type: str,
) -> dict[str, object]:
    dataset_id = f"dataset_{uuid.uuid4().hex}"

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO datasets (
                    id,
                    datasource_id,
                    name,
                    source_type,
                    source_tables,
                    relationships
                )
                VALUES (%s, %s, %s, %s, %s, %s);
                """,
                (
                    dataset_id,
                    datasource_id,
                    name,
                    source_type,
                    Jsonb(source_tables),
                    Jsonb(relationships),
                ),
            )

            for index, field in enumerate(fields):
                cursor.execute(
                    """
                    INSERT INTO dataset_fields (
                        id,
                        dataset_id,
                        source_name,
                        display_name,
                        data_type,
                        ordinal_position,
                        selected,
                        semantic_type,
                        aggregation,
                        config
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        f"df_{uuid.uuid4().hex}",
                        dataset_id,
                        str(
                            field.get("source_name") or field.get("display_name") or ""
                        ),
                        str(
                            field.get("display_name") or field.get("source_name") or ""
                        ),
                        normalize_dataset_field_type(field.get("data_type")),
                        index,
                        bool(field.get("selected", True)),
                        str(field.get("semantic_type") or "dimension"),
                        field.get("aggregation"),
                        Jsonb(
                            {
                                "expression": field.get("expression"),
                                "field_kind": str(field.get("field_kind") or "source"),
                            }
                        ),
                    ),
                )

    return {
        "datasource_id": datasource_id,
        "id": dataset_id,
        "name": name,
        "relationships": relationships,
        "source_tables": source_tables,
        "source_type": source_type,
    }


def update_dataset(
    *,
    datasource_id: str,
    dataset_id: str,
    fields: list[dict[str, object]],
    name: str,
    relationships: list[dict[str, object]],
    source_tables: list[str],
    source_type: str,
) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE datasets
                SET
                    datasource_id = %s,
                    name = %s,
                    source_type = %s,
                    source_tables = %s,
                    relationships = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (
                    datasource_id,
                    name,
                    source_type,
                    Jsonb(source_tables),
                    Jsonb(relationships),
                    dataset_id,
                ),
            )
            updated_count = cursor.rowcount

            if updated_count == 0:
                return None

            cursor.execute(
                "DELETE FROM dataset_fields WHERE dataset_id = %s;", (dataset_id,)
            )

            for index, field in enumerate(fields):
                cursor.execute(
                    """
                    INSERT INTO dataset_fields (
                        id,
                        dataset_id,
                        source_name,
                        display_name,
                        data_type,
                        ordinal_position,
                        selected,
                        semantic_type,
                        aggregation,
                        config
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        f"df_{uuid.uuid4().hex}",
                        dataset_id,
                        str(
                            field.get("source_name") or field.get("display_name") or ""
                        ),
                        str(
                            field.get("display_name") or field.get("source_name") or ""
                        ),
                        normalize_dataset_field_type(field.get("data_type")),
                        index,
                        bool(field.get("selected", True)),
                        str(field.get("semantic_type") or "dimension"),
                        field.get("aggregation"),
                        Jsonb(
                            {
                                "expression": field.get("expression"),
                                "field_kind": str(field.get("field_kind") or "source"),
                            }
                        ),
                    ),
                )

    return {
        "datasource_id": datasource_id,
        "id": dataset_id,
        "name": name,
        "relationships": relationships,
        "source_tables": source_tables,
        "source_type": source_type,
    }


def create_local_file_items(
    *,
    bucket: str | None,
    content_type: str | None,
    file_name: str,
    file_size: int | None,
    object_key: str | None,
    sheets: list[dict[str, object]],
) -> list[dict[str, object]]:
    created_items: list[dict[str, object]] = []

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for sheet in sheets:
                item_id = f"lf_{uuid.uuid4().hex}"
                sheet_name = str(
                    sheet.get("sheet_name") or sheet.get("display_name") or "Sheet"
                )
                display_name = str(sheet.get("display_name") or sheet_name)
                header_row = int(sheet.get("header_row") or 1)
                fields = (
                    sheet.get("fields") if isinstance(sheet.get("fields"), list) else []
                )

                cursor.execute(
                    """
                    INSERT INTO local_file_items (
                        id,
                        file_name,
                        bucket,
                        object_key,
                        content_type,
                        file_size,
                        sheet_name,
                        display_name,
                        header_row,
                        fields
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (
                        item_id,
                        file_name,
                        bucket,
                        object_key,
                        content_type,
                        file_size,
                        sheet_name,
                        display_name,
                        header_row,
                        Jsonb(fields),
                    ),
                )
                created_items.append(
                    {
                        "id": item_id,
                        "file_name": file_name,
                        "bucket": bucket,
                        "object_key": object_key,
                        "sheet_name": sheet_name,
                        "display_name": display_name,
                        "header_row": header_row,
                        "status": "ready",
                    }
                )

    return created_items


def list_local_file_items() -> list[dict[str, object]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(
                    JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', id,
                            'file_name', file_name,
                            'bucket', bucket,
                            'object_key', object_key,
                            'content_type', content_type,
                            'file_size', file_size,
                            'sheet_name', sheet_name,
                            'display_name', display_name,
                            'header_row', header_row,
                            'fields', fields,
                            'status', status,
                            'owner', owner,
                            'updated_at', TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS')
                        )
                        ORDER BY updated_at DESC
                    ),
                    '[]'::JSONB
                )
                FROM local_file_items;
                """
            )
            row = cursor.fetchone()

    return cast(list[dict[str, object]], row[0] if row else [])


def get_local_file_item(item_id: str) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    file_name,
                    bucket,
                    object_key,
                    content_type,
                    file_size,
                    sheet_name,
                    display_name,
                    header_row,
                    fields,
                    status,
                    owner,
                    TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS') AS updated_at
                FROM local_file_items
                WHERE id = %s;
                """,
                (item_id,),
            )
            row = cursor.fetchone()

    return dict(row) if row else None


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


def create_screen(
    *,
    dataset_id: str,
    name: str,
    prompt: str,
    spec: dict[str, object],
) -> dict[str, object]:
    screen_id = f"screen_{uuid.uuid4().hex}"

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO screens (
                    id,
                    dataset_id,
                    name,
                    prompt,
                    spec
                )
                VALUES (%s, %s, %s, %s, %s);
                """,
                (
                    screen_id,
                    dataset_id,
                    name,
                    prompt,
                    Jsonb(spec),
                ),
            )

    return {
        "dataset_id": dataset_id,
        "id": screen_id,
        "name": name,
        "prompt": prompt,
        "spec": spec,
        "status": "draft",
    }


def get_screen(screen_id: str) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    dataset_id,
                    name,
                    prompt,
                    status,
                    spec,
                    TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS') AS updated_at
                FROM screens
                WHERE id = %s
                LIMIT 1;
                """,
                (screen_id,),
            )
            row = cursor.fetchone()

    return dict(row) if row else None


def list_screens(*, page: int, page_size: int) -> dict[str, object]:
    safe_page = max(page, 1)
    safe_page_size = max(1, min(page_size, 100))
    offset = (safe_page - 1) * safe_page_size

    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM screens;")
            total_row = cursor.fetchone()
            total = int(total_row["total"]) if total_row and total_row.get("total") is not None else 0

            cursor.execute(
                """
                SELECT
                    id,
                    dataset_id,
                    name,
                    prompt,
                    status,
                    TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS') AS updated_at
                FROM screens
                ORDER BY updated_at DESC, created_at DESC
                LIMIT %s
                OFFSET %s;
                """,
                (safe_page_size, offset),
            )
            rows = cursor.fetchall()

    total_pages = max((total + safe_page_size - 1) // safe_page_size, 1)
    return {
        "items": [dict(row) for row in rows],
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


def update_screen(
    *,
    name: str | None,
    screen_id: str,
    spec: dict[str, object],
) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                UPDATE screens
                SET
                    name = COALESCE(%s, name),
                    spec = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING
                    id,
                    dataset_id,
                    name,
                    prompt,
                    status,
                    spec,
                    TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS') AS updated_at;
                """,
                (name, Jsonb(spec), screen_id),
            )
            row = cursor.fetchone()

    return dict(row) if row else None


def update_screen_status(screen_id: str, status: str) -> dict[str, object] | None:
    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                UPDATE screens
                SET status = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING
                    id,
                    dataset_id,
                    name,
                    prompt,
                    status,
                    spec,
                    TO_CHAR(updated_at, 'YYYY/MM/DD HH24:MI:SS') AS updated_at;
                """,
                (status, screen_id),
            )
            row = cursor.fetchone()

    return dict(row) if row else None


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
                    UNION ALL
                    SELECT 'local_file_items', COUNT(*) FROM local_file_items
                ) table_counts
                ORDER BY table_name;
                """
            )
            rows = cursor.fetchall()

    return [(str(table_name), int(row_count)) for table_name, row_count in rows]
