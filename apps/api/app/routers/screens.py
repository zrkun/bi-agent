from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.database import (
    create_screen,
    get_screen,
    list_screens as query_screens,
    update_screen,
    update_screen_status,
)
from app.services.datasets.profile import build_dataset_profile
from app.services.datasets.query_executor import execute_dataset_query
from app.services.datasets.types import (
    DatasetMeasureSpec,
    DatasetQueryFieldRef,
    DatasetQueryRequest,
    DatasetSortSpec,
)
from app.services.screens.generator import generate_screen_preview

router = APIRouter(prefix="/api/screens", tags=["screens"])


class GeneratePreviewSize(BaseModel):
    width: int = 1920
    height: int = 1080


class GeneratePreviewRequest(BaseModel):
    dataset_id: str
    prompt: str
    theme: str = "light"
    size: GeneratePreviewSize | None = None


class SaveScreenRequest(BaseModel):
    dataset_id: str
    name: str
    prompt: str = ""
    spec: dict[str, object]


class UpdateScreenRequest(BaseModel):
    name: str | None = None
    spec: dict[str, object]


class UpdateScreenStatusRequest(BaseModel):
    status: str


@router.post("/generate-preview")
def generate_preview(payload: GeneratePreviewRequest) -> dict[str, object]:
    size = payload.size or GeneratePreviewSize()
    screen = generate_screen_preview(
        dataset_id=payload.dataset_id,
        prompt=payload.prompt,
        theme=payload.theme,
        width=size.width,
        height=size.height,
    )

    return {"ok": True, "screen": screen.model_dump()}


@router.post("")
def save_screen(payload: SaveScreenRequest) -> dict[str, object]:
    screen = create_screen(
        dataset_id=payload.dataset_id,
        name=payload.name,
        prompt=payload.prompt,
        spec=payload.spec,
    )

    return {"ok": True, "screen": hydrate_screen_preview(screen)}


@router.get("/{screen_id}")
def get_screen_detail(screen_id: str) -> dict[str, object]:
    screen = get_screen(screen_id)

    return {
        "ok": screen is not None,
        "screen": hydrate_screen_preview(screen) if screen else None,
    }


@router.patch("/{screen_id}")
def update_screen_detail(screen_id: str, payload: UpdateScreenRequest) -> dict[str, object]:
    screen = update_screen(name=payload.name, screen_id=screen_id, spec=payload.spec)

    return {
        "ok": screen is not None,
        "screen": hydrate_screen_preview(screen) if screen else None,
    }


@router.patch("/{screen_id}/status")
def update_status(screen_id: str, payload: UpdateScreenStatusRequest) -> dict[str, object]:
    if payload.status not in {"draft", "published"}:
        return {"message": "状态只能是 draft 或 published。", "ok": False, "screen": None}

    screen = update_screen_status(screen_id, payload.status)

    return {
        "ok": screen is not None,
        "screen": hydrate_screen_preview(screen) if screen else None,
    }


def hydrate_screen_preview(screen: dict[str, object]) -> dict[str, object]:
    hydrated = dict(screen)
    spec = hydrated.get("spec") if isinstance(hydrated.get("spec"), dict) else {}
    data_bindings = spec.get("dataBindings") if isinstance(spec, dict) else None

    hydrated["preview_data"] = build_preview_data_from_bindings(
        str(hydrated.get("dataset_id") or ""),
        data_bindings if isinstance(data_bindings, dict) else {},
    )

    return hydrated


def build_preview_data_from_bindings(
    dataset_id: str, bindings: dict[str, object]
) -> dict[str, object]:
    if not dataset_id or not bindings:
        return {}

    profile = build_dataset_profile(dataset_id)
    preview_data: dict[str, object] = {}

    for binding_key, raw_binding in bindings.items():
        if not isinstance(raw_binding, dict):
            continue

        preview_data[str(binding_key)] = execute_dataset_query(
            profile, build_query_request_from_binding(raw_binding)
        )

    return preview_data


def build_query_request_from_binding(binding: dict[str, object]) -> DatasetQueryRequest:
    fields = binding.get("fields") if isinstance(binding.get("fields"), dict) else {}
    query_type = str(binding.get("queryType") or "table")
    aggregation = str(binding.get("aggregation") or "sum")
    dimensions: list[DatasetQueryFieldRef] = []
    measures: list[DatasetMeasureSpec] = []

    if query_type == "trend" and isinstance(fields.get("time"), str):
        dimensions.append(DatasetQueryFieldRef(field=str(fields["time"]), alias="x"))
    elif query_type in {"breakdown", "table"} and isinstance(fields.get("dimension"), str):
        dimensions.append(
            DatasetQueryFieldRef(
                field=str(fields["dimension"]),
                alias="label" if query_type == "breakdown" else None,
            )
        )

    if isinstance(fields.get("measure"), str) and query_type != "table":
        measures.append(
            DatasetMeasureSpec(
                field=str(fields["measure"]),
                aggregation=aggregation,  # type: ignore[arg-type]
                alias="y" if query_type == "trend" else "value",
            )
        )
    elif isinstance(fields.get("measures"), list) and query_type != "table":
        measures.extend(
            DatasetMeasureSpec(
                field=str(field),
                aggregation=aggregation,  # type: ignore[arg-type]
                alias=str(field),
            )
            for field in fields["measures"]
            if isinstance(field, str)
        )
    elif isinstance(fields.get("measure"), str):
        dimensions.append(DatasetQueryFieldRef(field=str(fields["measure"]), alias=None))

    sort = []
    if query_type == "trend":
        sort.append(DatasetSortSpec(field="x", direction="asc"))
    elif query_type == "breakdown" and measures:
        sort.append(DatasetSortSpec(field=measures[0].alias, direction="desc"))

    return DatasetQueryRequest(
        query_type=query_type,  # type: ignore[arg-type]
        dimensions=dimensions,
        measures=measures,
        sort=sort,
        limit=binding.get("limit") if isinstance(binding.get("limit"), int) else None,
        granularity=binding.get("granularity")
        if binding.get("granularity") in {"day", "week", "month"}
        else None,
    )


@router.get("")
def list_screens(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)) -> dict[str, object]:
    return query_screens(page=page, page_size=page_size)
