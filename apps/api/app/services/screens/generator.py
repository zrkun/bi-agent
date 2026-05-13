from app.config import get_llm_config
from app.services.agent.llm import chat_completion, parse_json_object
from app.services.datasets.profile import build_dataset_profile
from app.services.datasets.query_executor import execute_dataset_query
from app.services.datasets.types import (
    AggregationType,
    DatasetMeasureSpec,
    DatasetProfile,
    DatasetQueryFieldRef,
    DatasetQueryRequest,
    DatasetSortSpec,
)
from app.services.screens.compiler import build_query_bindings, compile_screen_plan
from app.services.screens.types import (
    BindingFieldPlan,
    GeneratePreviewMeta,
    GeneratePreviewPayload,
    ScreenPlan,
    WidgetBindingPlan,
    WidgetPlan,
)


def generate_screen_preview(
    *,
    dataset_id: str,
    prompt: str,
    theme: str = "light",
    width: int = 1920,
    height: int = 1080,
) -> GeneratePreviewPayload:
    profile = build_dataset_profile(dataset_id)
    plan = build_llm_screen_plan(profile=profile, prompt=prompt, theme=theme)
    if plan is None:
        plan = build_initial_screen_plan(profile=profile, prompt=prompt, theme=theme)
    query_bindings = build_query_bindings(plan, dataset_id)
    preview_data = build_preview_data(profile, plan)
    spec = compile_screen_plan(plan, dataset_id, width, height)
    spec["dataBindings"] = query_bindings

    return GeneratePreviewPayload(
        name=plan.title,
        dataset_id=dataset_id,
        spec=spec,
        preview_data=preview_data,
        meta=GeneratePreviewMeta(template=plan.template, warnings=plan.warnings),
    )


def build_llm_screen_plan(
    *,
    profile: DatasetProfile,
    prompt: str,
    theme: str,
) -> ScreenPlan | None:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        return None

    content = chat_completion(
        config=llm_config,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是 BI 大屏规划器。只能输出 JSON object，不能输出解释。"
                    "你需要基于用户需求和数据集字段生成可执行 ScreenPlan。"
                    "字段只能使用给定 fieldId，不能编造字段。"
                ),
            },
            {
                "role": "user",
                "content": build_screen_plan_prompt(profile, prompt, theme),
            },
        ],
        temperature=0.2,
    )
    parsed = parse_json_object(content)

    if not parsed:
        return None

    try:
        plan = ScreenPlan.model_validate(parsed)
    except ValueError:
        return None

    return normalize_llm_screen_plan(plan, profile, theme)


def build_screen_plan_prompt(profile: DatasetProfile, prompt: str, theme: str) -> str:
    fields = [
        {
            "fieldId": field.field_id,
            "displayName": field.display_name,
            "semanticType": field.semantic_type,
            "aggregation": field.aggregation,
        }
        for field in profile.fields
    ]

    return (
        "用户需求：\n"
        f"{prompt}\n\n"
        "数据集：\n"
        f"{profile.dataset_name}\n\n"
        "可用字段：\n"
        f"{fields}\n\n"
        "模板只表示页面风格，widgets 数量由用户需求和字段决定，"
        "不要为了套固定槽位而丢弃图表。\n\n"
        "请输出 JSON，格式：\n"
        "{"
        '"title":"不超过 12 个中文字符的短标题",'
        '"template":"executive_overview|trend_analysis|dimension_breakdown|complex_business_overview",'
        f'"theme":"{"light" if theme == "light" else "dark"}",'
        '"widgets":[{'
        '"id":"唯一英文ID",'
        '"slot":"英文布局标识，建议和 id 一致",'
        '"widget_type":"metric|area|line|bar|pie|radar|radial|table|rank|donut|progress",'
        '"title":"组件标题",'
        '"binding_key":"唯一英文绑定Key",'
        '"binding":{'
        '"query_type":"metric|trend|breakdown|table",'
        '"fields":{"measure":"指标fieldId或null","dimension":"维度fieldId或null","time":"时间fieldId或null"},'
        '"aggregation":"sum|avg|count|max|min或null",'
        '"granularity":"day|week|month或null",'
        '"limit":10,'
        '"format":"number|currency|percent或null",'
        '"show_comparison":false'
        "}}],"
        '"warnings":[]'
        "}\n"
        "约束：metric 必须有 measure；trend 必须有 measure 和 time；"
        "breakdown/pie/bar 通常需要 measure + dimension；table 至少有一个字段。"
    )


def normalize_llm_screen_plan(
    plan: ScreenPlan,
    profile: DatasetProfile,
    theme: str,
) -> ScreenPlan | None:
    valid_fields = {field.field_id for field in profile.fields}
    widgets: list[WidgetPlan] = []
    used_ids: set[str] = set()
    used_slots: set[str] = set()

    for index, widget in enumerate(plan.widgets, start=1):
        fields = widget.binding.fields
        measure = fields.measure if fields.measure in valid_fields else None
        dimension = fields.dimension if fields.dimension in valid_fields else None
        time_field = fields.time if fields.time in valid_fields else None

        if widget.binding.query_type == "metric" and not measure:
            continue
        if widget.binding.query_type == "trend" and not (measure and time_field):
            continue
        if widget.binding.query_type == "breakdown" and not (measure and dimension):
            continue
        if widget.binding.query_type == "table" and not any(
            [measure, dimension, time_field]
        ):
            continue

        widget_id = normalize_plan_key(widget.id, f"widget-{index}", used_ids)
        used_ids.add(widget_id)
        slot = normalize_plan_key(widget.slot or widget_id, widget_id, used_slots)
        used_slots.add(slot)

        binding_key = normalize_plan_key(widget.binding_key, widget_id, used_ids)
        used_ids.add(binding_key)

        widgets.append(
            widget.model_copy(
                update={
                    "id": widget_id,
                    "slot": slot,
                    "binding_key": binding_key,
                    "binding": widget.binding.model_copy(
                        update={
                            "fields": BindingFieldPlan(
                                measure=measure,
                                dimension=dimension,
                                time=time_field,
                            )
                        }
                    ),
                }
            )
        )

    if not widgets:
        return None

    title = plan.title.strip()[:16] if plan.title.strip() else profile.dataset_name

    return plan.model_copy(
        update={
            "title": title,
            "theme": "light" if theme == "light" else "dark",
            "widgets": widgets,
        }
    )


def normalize_plan_key(value: str, fallback: str, used: set[str]) -> str:
    normalized = "".join(
        char.lower() if char.isalnum() else "-" for char in value.strip()
    ).strip("-")
    normalized = normalized or fallback

    while normalized in used:
        normalized = f"{normalized}-1"

    return normalized


def build_initial_screen_plan(
    *,
    profile: DatasetProfile,
    prompt: str,
    theme: str,
) -> ScreenPlan:
    primary_measure = profile.measures[0] if profile.measures else None
    secondary_measure = profile.measures[1] if len(profile.measures) > 1 else None
    tertiary_measure = profile.measures[2] if len(profile.measures) > 2 else None
    primary_dimension = profile.dimensions[0] if profile.dimensions else None
    secondary_dimension = profile.dimensions[1] if len(profile.dimensions) > 1 else None
    time_field = profile.default_time_field
    warnings: list[str] = []
    widgets: list[WidgetPlan] = []
    title = infer_title(prompt, profile.dataset_name)

    if not primary_measure:
        widgets.append(build_table_widget(profile, "bottom_table"))

        return ScreenPlan(
            title=title,
            template="executive_overview",
            theme="light" if theme != "dark" else "dark",
            widgets=widgets,
            warnings=warnings,
        )

    widgets.append(
        build_metric_widget(
            widget_id="metric-primary",
            slot="kpi_1",
            title=field_label(profile, primary_measure),
            measure=primary_measure,
            aggregation=field_aggregation(profile, primary_measure),
            time_field=time_field,
        )
    )

    if secondary_measure:
        widgets.append(
            build_metric_widget(
                widget_id="metric-secondary",
                slot="kpi_2",
                title=field_label(profile, secondary_measure),
                measure=secondary_measure,
                aggregation=field_aggregation(profile, secondary_measure),
                time_field=time_field,
            )
        )

    if tertiary_measure:
        widgets.append(
            build_metric_widget(
                widget_id="metric-tertiary",
                slot="kpi_3",
                title=field_label(profile, tertiary_measure),
                measure=tertiary_measure,
                aggregation=field_aggregation(profile, tertiary_measure),
                time_field=time_field,
            )
        )

    if time_field:
        widgets.append(
            WidgetPlan(
                id="trend-primary",
                slot="main_trend",
                widget_type="line",
                title=join_labels(
                    field_label(profile, primary_measure),
                    field_label(profile, time_field),
                ),
                binding_key="trend-primary",
                binding=WidgetBindingPlan(
                    query_type="trend",
                    fields=BindingFieldPlan(measure=primary_measure, time=time_field),
                    aggregation=field_aggregation(profile, primary_measure),
                    granularity="month",
                ),
            )
        )

    if primary_dimension:
        widgets.append(
            WidgetPlan(
                id="breakdown-primary",
                slot="main_breakdown",
                widget_type="bar",
                title=join_labels(
                    field_label(profile, primary_dimension),
                    field_label(profile, primary_measure),
                ),
                binding_key="breakdown-primary",
                binding=WidgetBindingPlan(
                    query_type="breakdown",
                    fields=BindingFieldPlan(
                        measure=primary_measure,
                        dimension=primary_dimension,
                    ),
                    aggregation=field_aggregation(profile, primary_measure),
                    limit=10,
                ),
            )
        )

    if secondary_dimension or primary_dimension:
        widgets.append(build_table_widget(profile, "bottom_table"))

    return ScreenPlan(
        title=title,
        template="executive_overview",
        theme="light" if theme != "dark" else "dark",
        widgets=widgets,
        warnings=warnings,
    )


def infer_title(prompt: str, dataset_name: str) -> str:
    clean_prompt = prompt.strip()

    return clean_prompt or dataset_name


def field_label(profile: DatasetProfile, field_id: str | None) -> str:
    if not field_id:
        return ""

    field = next((item for item in profile.fields if item.field_id == field_id), None)

    if not field:
        return field_id

    return normalize_display_label(field.display_name)


def normalize_display_label(label: str) -> str:
    return label.rsplit(".", 1)[-1] if "." in label else label


def join_labels(*labels: str) -> str:
    return " / ".join(label for label in labels if label)


def field_aggregation(profile: DatasetProfile, field_id: str | None) -> AggregationType:
    if not field_id:
        return "sum"

    field = next((item for item in profile.fields if item.field_id == field_id), None)

    return field.aggregation or "sum" if field else "sum"


def build_metric_widget(
    *,
    widget_id: str,
    slot: str,
    title: str,
    measure: str,
    aggregation: AggregationType,
    time_field: str | None,
) -> WidgetPlan:
    return WidgetPlan(
        id=widget_id,
        slot=slot,
        widget_type="metric",
        title=title,
        binding_key=widget_id,
        binding=WidgetBindingPlan(
            query_type="metric",
            fields=BindingFieldPlan(measure=measure, time=time_field),
            aggregation=aggregation,
            format="number",
            show_comparison=bool(time_field),
        ),
    )


def build_table_widget(profile: DatasetProfile, slot: str) -> WidgetPlan:
    table_fields = [
        profile.default_time_field,
        profile.dimensions[0] if profile.dimensions else None,
        profile.measures[0] if profile.measures else None,
    ]

    return WidgetPlan(
        id="table-detail",
        slot=slot,
        widget_type="table",
        title=join_labels(*(field_label(profile, field) for field in table_fields)),
        binding_key="table-detail",
        binding=WidgetBindingPlan(
            query_type="table",
            fields=BindingFieldPlan(
                measure=profile.measures[0] if profile.measures else None,
                dimension=profile.dimensions[0] if profile.dimensions else None,
                time=profile.default_time_field,
            ),
            aggregation=field_aggregation(profile, profile.measures[0])
            if profile.measures
            else None,
            limit=20,
        ),
    )


def build_preview_data(profile: DatasetProfile, plan: ScreenPlan) -> dict:
    preview_data: dict[str, dict] = {}

    for widget in plan.widgets:
        query_request = build_dataset_query_request(profile, widget)
        preview_data[widget.binding_key] = execute_dataset_query(profile, query_request)

    return preview_data


def build_dataset_query_request(
    profile: DatasetProfile,
    widget: WidgetPlan,
) -> DatasetQueryRequest:
    binding = widget.binding
    fields = binding.fields
    dimensions: list[DatasetQueryFieldRef] = []
    measures: list[DatasetMeasureSpec] = []

    if fields.time and binding.query_type == "trend":
        dimensions.append(DatasetQueryFieldRef(field=fields.time, alias="x"))
    elif fields.dimension:
        dimensions.append(DatasetQueryFieldRef(field=fields.dimension, alias="label"))

    if binding.query_type == "table":
        dimensions = [
            DatasetQueryFieldRef(
                field=field_name, alias=field_label(profile, field_name)
            )
            for field_name in [fields.time, fields.dimension]
            if field_name
        ]

    if fields.measure and binding.aggregation:
        measures.append(
            DatasetMeasureSpec(
                field=fields.measure,
                aggregation=binding.aggregation,
                alias="y"
                if binding.query_type == "trend"
                else field_label(profile, fields.measure),
            )
        )

    sort = []

    if binding.query_type == "trend":
        sort.append(DatasetSortSpec(field="x", direction="asc"))
    elif binding.query_type == "breakdown":
        sort.append(DatasetSortSpec(field="value", direction="desc"))

    return DatasetQueryRequest(
        query_type=binding.query_type,
        dimensions=dimensions,
        measures=measures,
        sort=sort,
        limit=binding.limit,
        granularity=binding.granularity,
    )
