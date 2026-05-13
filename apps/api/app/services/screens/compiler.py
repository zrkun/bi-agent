from app.services.screens.catalog import get_node_type_for_widget
from app.services.screens.templates import get_root_layout
from app.services.screens.types import ScreenPlan, WidgetPlan


SCREEN_MARGIN = 32
SCREEN_GAP = 24
HEADER_HEIGHT = 72
KPI_HEIGHT = 124
CHART_HEIGHT = 348
TABLE_HEIGHT = 292
COMPACT_VISUAL_TYPES = {"pie", "donut", "radar", "radial"}
COMPACT_ROW_HEIGHT = 300
COMPACT_WIDTH_RATIO = 0.3


def compile_screen_plan(
    plan: ScreenPlan,
    dataset_id: str,
    width: int = 1920,
    height: int = 1080,
) -> dict:
    elements: dict[str, dict] = {}
    root_id = "screen-root"
    header_id = "screen-header"
    widget_layouts = build_plan_widget_layouts(plan, width, height)
    widget_ids = [
        widget.id for widget in plan.widgets if widget.id in widget_layouts
    ]
    content_height = calculate_root_height(widget_layouts, height)

    elements[root_id] = {
        "type": "DashboardRoot",
        "props": {
            "layout": get_root_layout(width, content_height),
            "title": plan.title,
            "theme": plan.theme,
        },
        "children": [header_id, *widget_ids],
    }
    elements[header_id] = {
        "type": "SectionHeader",
        "props": {
            "layout": {
                "x": SCREEN_MARGIN,
                "y": 28,
                "w": width - SCREEN_MARGIN * 2,
                "h": HEADER_HEIGHT,
            },
            "title": plan.title,
        },
        "children": [],
    }

    for widget in plan.widgets:
        if widget.id not in widget_layouts:
            continue

        elements[widget.id] = {
            "type": get_node_type_for_widget(widget.widget_type),
            "props": {
                "layout": widget_layouts.get(widget.id),
                "title": widget.title,
                "bindingKey": widget.binding_key,
                "format": widget.binding.format,
            },
            "children": [],
        }

    return {
        "version": "1.0",
        "root": root_id,
        "meta": {
            "datasetId": dataset_id,
            "title": plan.title,
            "template": plan.template,
            "theme": plan.theme,
        },
        "elements": elements,
    }


def calculate_root_height(
    widget_layouts: dict[str, dict[str, int]], default_height: int
) -> int:
    if not widget_layouts:
        return default_height

    content_bottom = max(
        layout["y"] + layout["h"] for layout in widget_layouts.values()
    )

    return max(default_height, content_bottom + SCREEN_MARGIN)


def build_dynamic_widget_layouts(
    widgets: list[WidgetPlan], width: int, height: int
) -> dict[str, dict[str, int]]:
    return build_overview_layout(widgets, width)


def build_plan_widget_layouts(
    plan: ScreenPlan, width: int, height: int
) -> dict[str, dict[str, int]]:
    # Layout rules implement docs/dashboard-layout-guidelines.md during
    # json-render spec generation, not only during LLM planning.
    if plan.template == "trend_analysis":
        return build_trend_analysis_layout(plan.widgets, width)
    if plan.template == "dimension_breakdown":
        return build_dimension_breakdown_layout(plan.widgets, width)
    if plan.template == "complex_business_overview":
        return build_detail_first_layout(plan.widgets, width)

    return build_overview_layout(plan.widgets, width)


def is_compact_visual(widget: WidgetPlan) -> bool:
    return widget.widget_type in COMPACT_VISUAL_TYPES


def first_non_compact_visual(widgets: list[WidgetPlan]) -> WidgetPlan | None:
    return next((widget for widget in widgets if not is_compact_visual(widget)), None)


def pair_trailing_compact_widgets(widgets: list[WidgetPlan]) -> list[WidgetPlan]:
    if len(widgets) < 2 or not is_compact_visual(widgets[-1]):
        return widgets

    last_row_start = len(widgets) - 1
    previous_non_compact_index = next(
        (
            index
            for index in range(len(widgets) - 2, -1, -1)
            if not is_compact_visual(widgets[index])
        ),
        None,
    )

    if previous_non_compact_index is None:
        return widgets

    paired = [*widgets]
    partner = paired.pop(previous_non_compact_index)
    insert_at = last_row_start - 1 if previous_non_compact_index < last_row_start else last_row_start
    paired.insert(insert_at, partner)

    return paired


def drop_unpaired_compact_widgets(widgets: list[WidgetPlan]) -> list[WidgetPlan]:
    if len(widgets) == 1 and is_compact_visual(widgets[0]):
        return []

    paired = pair_trailing_compact_widgets(widgets)
    if len(paired) == 1 and is_compact_visual(paired[0]):
        return []

    return paired


def choose_grid_columns(item_count: int, max_columns: int) -> int:
    if item_count <= 1:
        return 1
    if item_count == 4 and max_columns >= 2:
        return 2
    if item_count % max_columns == 1 and max_columns > 2:
        return max_columns - 1

    return min(max_columns, item_count)


def get_grid_item_width(
    content_w: int, column_count: int, column: int
) -> int:
    column_w = (content_w - SCREEN_GAP * (column_count - 1)) // column_count

    if column < column_count - 1:
        return column_w

    return content_w - column * (column_w + SCREEN_GAP)


def layout_visual_rows(
    *,
    content_w: int,
    content_x: int,
    current_y: int,
    height: int,
    layouts: dict[str, dict[str, int]],
    max_columns: int,
    widgets: list[WidgetPlan],
) -> int:
    widgets = drop_unpaired_compact_widgets(widgets)
    index = 0

    while index < len(widgets):
        widget = widgets[index]

        if is_compact_visual(widget):
            partner = widgets[index + 1] if index + 1 < len(widgets) else None
            if partner is None:
                break

            add_compact_pair_layout(
                compact=widget,
                content_w=content_w,
                content_x=content_x,
                current_y=current_y,
                height=height,
                layouts=layouts,
                partner=partner,
            )
            current_y += height + SCREEN_GAP
            index += 2
            continue

        if index + 1 < len(widgets) and is_compact_visual(widgets[index + 1]):
            add_compact_pair_layout(
                compact=widgets[index + 1],
                content_w=content_w,
                content_x=content_x,
                current_y=current_y,
                height=height,
                layouts=layouts,
                partner=widget,
            )
            current_y += height + SCREEN_GAP
            index += 2
            continue

        row_widgets: list[WidgetPlan] = []
        while (
            index < len(widgets)
            and not is_compact_visual(widgets[index])
            and len(row_widgets) < max_columns
        ):
            row_widgets.append(widgets[index])
            index += 1

        column_count = choose_grid_columns(len(row_widgets), max_columns)
        column_w = (content_w - SCREEN_GAP * (column_count - 1)) // column_count
        for column, row_widget in enumerate(row_widgets):
            layouts[row_widget.id] = {
                "x": content_x + column * (column_w + SCREEN_GAP),
                "y": current_y,
                "w": get_grid_item_width(content_w, column_count, column),
                "h": height,
            }
        current_y += height + SCREEN_GAP

    return current_y


def add_compact_pair_layout(
    *,
    compact: WidgetPlan,
    content_w: int,
    content_x: int,
    current_y: int,
    height: int,
    layouts: dict[str, dict[str, int]],
    partner: WidgetPlan,
) -> None:
    compact_w = int(content_w * COMPACT_WIDTH_RATIO)
    if is_compact_visual(partner):
        pair_w = compact_w * 2 + SCREEN_GAP
        start_x = content_x + (content_w - pair_w) // 2
        partner_w = compact_w
    else:
        start_x = content_x
        partner_w = content_w - compact_w - SCREEN_GAP

    layouts[partner.id] = {
        "x": start_x,
        "y": current_y,
        "w": partner_w,
        "h": height,
    }
    layouts[compact.id] = {
        "x": start_x + partner_w + SCREEN_GAP,
        "y": current_y,
        "w": compact_w,
        "h": height,
    }


def build_overview_layout(
    widgets: list[WidgetPlan], width: int
) -> dict[str, dict[str, int]]:
    content_x = SCREEN_MARGIN
    content_w = width - SCREEN_MARGIN * 2
    current_y = 124
    layouts: dict[str, dict[str, int]] = {}
    metric_widgets = [
        widget
        for widget in widgets
        if widget.widget_type in {"metric", "progress"}
    ]
    visual_widgets = [
        widget
        for widget in widgets
        if widget.widget_type not in {"metric", "progress", "table"}
    ]
    table_widgets = [widget for widget in widgets if widget.widget_type == "table"]

    if (
        len(metric_widgets) <= 2
        and len(visual_widgets) >= 4
        and first_non_compact_visual(visual_widgets)
    ):
        return build_hero_visual_layout(
            metric_widgets=metric_widgets,
            visual_widgets=visual_widgets,
            table_widgets=table_widgets,
            width=width,
        )

    if metric_widgets:
        column_count = choose_grid_columns(len(metric_widgets), 4)
        column_w = (content_w - SCREEN_GAP * (column_count - 1)) // column_count

        for index, widget in enumerate(metric_widgets):
            row = index // column_count
            column = index % column_count
            layouts[widget.id] = {
                "x": content_x + column * (column_w + SCREEN_GAP),
                "y": current_y + row * (KPI_HEIGHT + SCREEN_GAP),
                "w": column_w if column < column_count - 1 else content_w - column * (column_w + SCREEN_GAP),
                "h": KPI_HEIGHT,
            }

        metric_rows = (len(metric_widgets) + column_count - 1) // column_count
        current_y += metric_rows * KPI_HEIGHT + (metric_rows - 1) * SCREEN_GAP + SCREEN_GAP

    if visual_widgets:
        visual_widgets = drop_unpaired_compact_widgets(visual_widgets)

    if visual_widgets:
        current_y = layout_visual_rows(
            content_w=content_w,
            content_x=content_x,
            current_y=current_y,
            height=CHART_HEIGHT,
            layouts=layouts,
            max_columns=2,
            widgets=visual_widgets,
        )

    for index, widget in enumerate(table_widgets):
        layouts[widget.id] = {
            "x": content_x,
            "y": current_y + index * (TABLE_HEIGHT + SCREEN_GAP),
            "w": content_w,
            "h": TABLE_HEIGHT,
        }

    return layouts


def build_hero_visual_layout(
    *,
    metric_widgets: list[WidgetPlan],
    visual_widgets: list[WidgetPlan],
    table_widgets: list[WidgetPlan],
    width: int,
) -> dict[str, dict[str, int]]:
    content_x = SCREEN_MARGIN
    content_w = width - SCREEN_MARGIN * 2
    layouts: dict[str, dict[str, int]] = {}
    current_y = 124
    side_w = 456
    main_w = content_w - side_w - SCREEN_GAP
    hero_widget = next(
        (
            widget
            for widget in visual_widgets
            if widget.widget_type in {"area", "line"}
        ),
        first_non_compact_visual(visual_widgets),
    )
    if hero_widget is None:
        return build_overview_layout([*metric_widgets, *visual_widgets, *table_widgets], width)
    secondary_widgets = drop_unpaired_compact_widgets(
        [widget for widget in visual_widgets if widget.id != hero_widget.id]
    )
    hero_h = KPI_HEIGHT * max(2, len(metric_widgets)) + SCREEN_GAP * max(1, len(metric_widgets) - 1)

    layouts[hero_widget.id] = {
        "x": content_x,
        "y": current_y,
        "w": main_w,
        "h": hero_h,
    }

    for index, widget in enumerate(metric_widgets):
        layouts[widget.id] = {
            "x": content_x + main_w + SCREEN_GAP,
            "y": current_y + index * (KPI_HEIGHT + SCREEN_GAP),
            "w": side_w,
            "h": KPI_HEIGHT,
        }

    current_y += hero_h + SCREEN_GAP

    if secondary_widgets:
        current_y = layout_visual_rows(
            content_w=content_w,
            content_x=content_x,
            current_y=current_y,
            height=CHART_HEIGHT,
            layouts=layouts,
            max_columns=3,
            widgets=secondary_widgets,
        )

    for index, widget in enumerate(table_widgets):
        layouts[widget.id] = {
            "x": content_x,
            "y": current_y + index * (TABLE_HEIGHT + SCREEN_GAP),
            "w": content_w,
            "h": TABLE_HEIGHT,
        }

    return layouts


def build_trend_analysis_layout(
    widgets: list[WidgetPlan], width: int
) -> dict[str, dict[str, int]]:
    content_x = SCREEN_MARGIN
    content_w = width - SCREEN_MARGIN * 2
    metric_widgets = [widget for widget in widgets if widget.widget_type in {"metric", "progress"}]
    trend_widgets = [widget for widget in widgets if widget.widget_type in {"area", "line"}]
    other_visual_widgets = [
        widget
        for widget in widgets
        if widget.widget_type not in {"metric", "progress", "table", "area", "line"}
    ]
    table_widgets = [widget for widget in widgets if widget.widget_type == "table"]
    layouts: dict[str, dict[str, int]] = {}
    current_y = 124
    hero_widget = trend_widgets[0] if trend_widgets else first_non_compact_visual(other_visual_widgets)

    if hero_widget:
        layouts[hero_widget.id] = {
            "x": content_x,
            "y": current_y,
            "w": content_w,
            "h": 420,
        }
        current_y += 420 + SCREEN_GAP

    remaining_metric_widgets = [
        widget for widget in metric_widgets if widget.id not in layouts
    ]
    if remaining_metric_widgets:
        column_count = choose_grid_columns(len(remaining_metric_widgets), 4)
        column_w = (content_w - SCREEN_GAP * (column_count - 1)) // column_count
        for index, widget in enumerate(remaining_metric_widgets):
            column = index % column_count
            layouts[widget.id] = {
                "x": content_x + column * (column_w + SCREEN_GAP),
                "y": current_y,
                "w": column_w if column < column_count - 1 else content_w - column * (column_w + SCREEN_GAP),
                "h": KPI_HEIGHT,
            }
        current_y += KPI_HEIGHT + SCREEN_GAP

    side_widgets = [
        widget
        for widget in [*trend_widgets[1:], *other_visual_widgets]
        if widget.id not in layouts
    ]
    side_widgets = drop_unpaired_compact_widgets(side_widgets)
    if side_widgets:
        current_y = layout_visual_rows(
            content_w=content_w,
            content_x=content_x,
            current_y=current_y,
            height=COMPACT_ROW_HEIGHT,
            layouts=layouts,
            max_columns=3,
            widgets=side_widgets,
        )

    for index, widget in enumerate(table_widgets):
        if widget.id in layouts:
            continue
        layouts[widget.id] = {
            "x": content_x,
            "y": current_y + index * (TABLE_HEIGHT + SCREEN_GAP),
            "w": content_w,
            "h": TABLE_HEIGHT,
        }

    return layouts


def build_dimension_breakdown_layout(
    widgets: list[WidgetPlan], width: int
) -> dict[str, dict[str, int]]:
    content_x = SCREEN_MARGIN
    content_w = width - SCREEN_MARGIN * 2
    metric_widgets = [widget for widget in widgets if widget.widget_type in {"metric", "progress"}]
    visual_widgets = [
        widget
        for widget in widgets
        if widget.widget_type not in {"metric", "progress", "table"}
    ]
    table_widgets = [widget for widget in widgets if widget.widget_type == "table"]
    layouts: dict[str, dict[str, int]] = {}
    current_y = 124

    if metric_widgets:
        column_count = choose_grid_columns(len(metric_widgets), 4)
        metric_w = (content_w - SCREEN_GAP * (column_count - 1)) // column_count
        for index, widget in enumerate(metric_widgets):
            row = index // column_count
            column = index % column_count
            layouts[widget.id] = {
                "x": content_x + column * (metric_w + SCREEN_GAP),
                "y": current_y + row * (KPI_HEIGHT + SCREEN_GAP),
                "w": get_grid_item_width(content_w, column_count, column),
                "h": KPI_HEIGHT,
            }
        rows = (len(metric_widgets) + column_count - 1) // column_count
        current_y += rows * KPI_HEIGHT + (rows - 1) * SCREEN_GAP + SCREEN_GAP

    if visual_widgets:
        first = first_non_compact_visual(visual_widgets)
        if first is None:
            visual_widgets = drop_unpaired_compact_widgets(visual_widgets)
            current_y = layout_visual_rows(
                content_w=content_w,
                content_x=content_x,
                current_y=current_y,
                height=COMPACT_ROW_HEIGHT,
                layouts=layouts,
                max_columns=2,
                widgets=visual_widgets,
            )

            for index, widget in enumerate(table_widgets):
                layouts[widget.id] = {
                    "x": content_x,
                    "y": current_y + index * (TABLE_HEIGHT + SCREEN_GAP),
                    "w": content_w,
                    "h": TABLE_HEIGHT,
                }

            return layouts
        remaining_after_first = [widget for widget in visual_widgets if widget.id != first.id]
        if remaining_after_first and is_compact_visual(remaining_after_first[0]):
            add_compact_pair_layout(
                compact=remaining_after_first[0],
                content_w=content_w,
                content_x=content_x,
                current_y=current_y,
                height=468,
                layouts=layouts,
                partner=first,
            )
            current_y += 468 + SCREEN_GAP
            remaining_widgets = remaining_after_first[1:]
        else:
            side_widgets = remaining_after_first[:2]
            layouts[first.id] = {
                "x": content_x,
                "y": current_y,
                "w": (content_w - SCREEN_GAP) // 2,
                "h": 468,
            }
            side_x = content_x + (content_w + SCREEN_GAP) // 2
            side_w = (content_w - SCREEN_GAP) // 2
            for index, widget in enumerate(side_widgets):
                layouts[widget.id] = {
                    "x": side_x,
                    "y": current_y + index * (222 + SCREEN_GAP),
                    "w": side_w,
                    "h": 222,
                }
            current_y += 468 + SCREEN_GAP
            remaining_widgets = remaining_after_first[2:]

        remaining_widgets = drop_unpaired_compact_widgets(remaining_widgets)
        if remaining_widgets:
            current_y = layout_visual_rows(
                content_w=content_w,
                content_x=content_x,
                current_y=current_y,
                height=COMPACT_ROW_HEIGHT,
                layouts=layouts,
                max_columns=3,
                widgets=remaining_widgets,
            )

    for index, widget in enumerate(table_widgets):
        layouts[widget.id] = {
            "x": content_x,
            "y": current_y + index * (TABLE_HEIGHT + SCREEN_GAP),
            "w": content_w,
            "h": TABLE_HEIGHT,
        }

    return layouts


def build_detail_first_layout(
    widgets: list[WidgetPlan], width: int
) -> dict[str, dict[str, int]]:
    content_x = SCREEN_MARGIN
    content_w = width - SCREEN_MARGIN * 2
    table_widgets = [widget for widget in widgets if widget.widget_type == "table"]
    other_widgets = [widget for widget in widgets if widget.widget_type != "table"]
    layouts: dict[str, dict[str, int]] = {}
    current_y = 124

    for widget in table_widgets[:1]:
        layouts[widget.id] = {
            "x": content_x,
            "y": current_y,
            "w": content_w,
            "h": 420,
        }
        current_y += 420 + SCREEN_GAP

    if other_widgets:
        other_widgets = drop_unpaired_compact_widgets(other_widgets)

    if other_widgets:
        current_y = layout_visual_rows(
            content_w=content_w,
            content_x=content_x,
            current_y=current_y,
            height=COMPACT_ROW_HEIGHT,
            layouts=layouts,
            max_columns=3,
            widgets=other_widgets,
        )

    for index, widget in enumerate(table_widgets[1:]):
        layouts[widget.id] = {
            "x": content_x,
            "y": current_y + (index + 1) * (TABLE_HEIGHT + SCREEN_GAP),
            "w": content_w,
            "h": TABLE_HEIGHT,
        }

    return layouts


def build_query_bindings(plan: ScreenPlan, dataset_id: str) -> dict:
    return {
        widget.binding_key: {
            "widgetId": widget.id,
            "datasetId": dataset_id,
            "queryType": widget.binding.query_type,
            "fields": widget.binding.fields.model_dump(exclude_none=True),
            "aggregation": widget.binding.aggregation,
            "granularity": widget.binding.granularity,
            "sort": widget.binding.sort.model_dump() if widget.binding.sort else None,
            "limit": widget.binding.limit,
            "display": {
                "format": widget.binding.format,
                "showComparison": widget.binding.show_comparison,
            },
        }
        for widget in plan.widgets
    }
