from app.services.screens.types import TemplateType

ROOT_LAYOUT = {"x": 0, "y": 0, "w": 1920, "h": 1080}

TEMPLATE_LAYOUTS: dict[TemplateType, dict[str, dict[str, int]]] = {
    "executive_overview": {
        "header": {"x": 32, "y": 28, "w": 1856, "h": 72},
        "kpi_1": {"x": 32, "y": 124, "w": 448, "h": 124},
        "kpi_2": {"x": 496, "y": 124, "w": 448, "h": 124},
        "kpi_3": {"x": 960, "y": 124, "w": 448, "h": 124},
        "kpi_4": {"x": 1424, "y": 124, "w": 464, "h": 124},
        "main_trend": {"x": 32, "y": 272, "w": 1120, "h": 420},
        "main_breakdown": {"x": 1184, "y": 272, "w": 704, "h": 420},
        "bottom_table": {"x": 32, "y": 724, "w": 1856, "h": 324},
    },
    "trend_analysis": {
        "header": {"x": 32, "y": 28, "w": 1856, "h": 72},
        "kpi_1": {"x": 32, "y": 124, "w": 448, "h": 124},
        "kpi_2": {"x": 496, "y": 124, "w": 448, "h": 124},
        "trend_1": {"x": 32, "y": 272, "w": 896, "h": 376},
        "trend_2": {"x": 960, "y": 272, "w": 928, "h": 376},
        "detail_table": {"x": 32, "y": 680, "w": 1856, "h": 368},
    },
    "dimension_breakdown": {
        "header": {"x": 32, "y": 28, "w": 1856, "h": 72},
        "kpi_1": {"x": 32, "y": 124, "w": 448, "h": 124},
        "kpi_2": {"x": 496, "y": 124, "w": 448, "h": 124},
        "breakdown_1": {"x": 32, "y": 272, "w": 896, "h": 376},
        "breakdown_2": {"x": 960, "y": 272, "w": 928, "h": 376},
        "table_1": {"x": 32, "y": 680, "w": 1856, "h": 368},
    },
}


def get_slot_layout(template: TemplateType, slot: str) -> dict[str, int]:
    return TEMPLATE_LAYOUTS.get(template, {}).get(
        slot, {"x": 32, "y": 124, "w": 480, "h": 240}
    )


def get_root_layout(width: int = 1920, height: int = 1080) -> dict[str, int]:
    return {**ROOT_LAYOUT, "w": width, "h": height}
