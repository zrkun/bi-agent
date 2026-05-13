import uuid
from collections.abc import Callable
from typing import Any, Literal, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from app.config import LlmConfig, get_llm_config
from app.services.agent.llm import (
    chat_completion,
    chat_completion_with_tools,
    parse_json_object,
    stream_chat_completion,
)
from app.services.datasets.profile import build_dataset_profile
from app.services.datasets.query_executor import execute_dataset_query
from app.services.datasets.types import (
    DatasetFilterSpec,
    DatasetMeasureSpec,
    DatasetQueryFieldRef,
    DatasetQueryRequest,
)
from app.services.screens.generator import generate_screen_preview
from app.services.screens.compiler import build_query_bindings, compile_screen_plan
from app.services.screens.generator import (
    build_initial_screen_plan,
    build_preview_data,
)
from app.services.screens.types import ScreenPlan
from app.services.screens.types import BindingFieldPlan, WidgetBindingPlan, WidgetPlan


AgentCapability = Literal["qa", "builder", "guide"]


class AgentGraphInput(TypedDict):
    capability: str
    dataset_id: str | None
    message: str


class AgentGraphState(TypedDict, total=False):
    answer: str
    capability: AgentCapability
    dataset_id: str | None
    events: list[dict[str, object]]
    guide_reason: str
    intent_result: dict[str, object]
    message: str
    plan: dict[str, object]
    profile: object
    query_result: dict[str, object]
    render_preview_data: dict[str, object]
    screen_output: dict[str, object]
    screen_plan: ScreenPlan


def run_agent_graph(payload: AgentGraphInput) -> list[dict[str, object]]:
    graph = build_agent_graph()
    state = graph.invoke(
        {
            "capability": infer_agent_capability(
                payload["message"], payload["capability"]
            ),
            "dataset_id": payload.get("dataset_id"),
            "events": [],
            "message": payload["message"],
        }
    )

    return state.get("events", [])


def stream_agent_graph(payload: AgentGraphInput):
    graph = build_agent_graph()

    yield from graph.stream(
        {
            "capability": infer_agent_capability(
                payload["message"], payload["capability"]
            ),
            "dataset_id": payload.get("dataset_id"),
            "events": [],
            "message": payload["message"],
        },
        stream_mode="custom",
    )


def build_agent_graph():
    graph = StateGraph(AgentGraphState)
    graph.add_node("start_run", start_run)
    graph.add_node("llm_intent", llm_intent)
    graph.add_node("load_dataset_profile", load_dataset_profile)
    graph.add_node("llm_planning", llm_planning)
    graph.add_node("adapt_data", adapt_data)
    graph.add_node("generate_dashboard_render", generate_dashboard_render)
    graph.add_node("llm_final_response", llm_final_response)
    graph.add_node("run_model_agent", run_model_agent)
    graph.add_node("load_context", load_context)
    graph.add_node("plan_query", plan_query)
    graph.add_node("run_query", run_query)
    graph.add_node("compose_query_answer", compose_query_answer)
    graph.add_node("plan_screen", plan_screen)
    graph.add_node("run_screen", run_screen)
    graph.add_node("guide_user", guide_user)
    graph.add_node("complete_run", complete_run)

    graph.add_edge(START, "start_run")
    graph.add_edge("start_run", "llm_intent")
    graph.add_conditional_edges(
        "llm_intent",
        route_after_intent,
        {"guide_user": "guide_user", "load_dataset_profile": "load_dataset_profile"},
    )
    graph.add_conditional_edges(
        "load_dataset_profile",
        route_after_dataset_profile,
        {"guide_user": "guide_user", "llm_planning": "llm_planning"},
    )
    graph.add_edge("llm_planning", "adapt_data")
    graph.add_edge("adapt_data", "generate_dashboard_render")
    graph.add_edge("generate_dashboard_render", "llm_final_response")
    graph.add_edge("llm_final_response", "complete_run")
    graph.add_conditional_edges(
        "load_context",
        route_after_context,
        {
            "guide_user": "guide_user",
            "plan_query": "plan_query",
            "plan_screen": "plan_screen",
        },
    )
    graph.add_edge("plan_query", "run_query")
    graph.add_edge("run_query", "compose_query_answer")
    graph.add_edge("compose_query_answer", "complete_run")
    graph.add_edge("plan_screen", "run_screen")
    graph.add_edge("run_screen", "complete_run")
    graph.add_edge("guide_user", "complete_run")
    graph.add_edge("complete_run", END)

    return graph.compile()


def start_run(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "run.started",
        {
            "datasetId": state.get("dataset_id") or "",
            "message": state["message"],
            "capability": state["capability"],
        },
    )

    return {**state, "events": events}


def llm_intent(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "step.started",
        {
            "stepId": "llm-intent",
            "step": "llm.intent",
            "label": "识别用户意图",
            "input": {
                "hasDataset": bool(state.get("dataset_id")),
                "message": state["message"],
                "supportedCapability": "dashboard_builder",
            },
        },
    )
    result = build_dashboard_intent(state)
    events.append(
        create_event(
            "step.completed",
            {
                "stepId": "llm-intent",
                "step": "llm.intent",
                "label": "识别用户意图",
                "output": result,
                "outputSummary": str(result.get("summary") or "已识别"),
            },
        )
    )

    return {**state, "events": events, "intent_result": result}


def load_dataset_profile(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "tool.started",
        {
            "toolCallId": "dataset-profile",
            "tool": "query_dataset",
            "label": "读取数据集信息",
            "input": {"datasetId": state.get("dataset_id") or ""},
        },
    )

    try:
        profile = build_dataset_profile(str(state["dataset_id"]))
    except Exception as exc:
        events.append(
            create_event(
                "tool.failed",
                {
                    "toolCallId": "dataset-profile",
                    "tool": "query_dataset",
                    "label": "读取数据集信息",
                    "output": {"error": str(exc)},
                },
            )
        )
        return {
            **state,
            "events": events,
            "guide_reason": "当前数据集暂时不可用。",
            "intent_result": {"intent": "guide"},
        }

    output = serialize_dataset_profile(profile)
    events.append(
        create_event(
            "tool.completed",
            {
                "toolCallId": "dataset-profile",
                "tool": "query_dataset",
                "label": "读取数据集信息",
                "output": output,
                "outputSummary": f"{len(profile.fields)} 个字段",
            },
        )
    )

    return {**state, "events": events, "profile": profile}


def llm_planning(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "step.started",
        {
            "stepId": "llm-planning",
            "step": "llm.planning",
            "label": "设计大屏方案",
            "input": {
                "datasetId": state.get("dataset_id") or "",
                "message": state["message"],
            },
        },
    )
    profile = state["profile"]
    dashboard_intent = build_llm_dashboard_render_intent(profile, state["message"])
    plan = build_screen_plan_from_dashboard_intent(
        profile, state["message"], dashboard_intent
    )

    output = {
        "intent": dashboard_intent,
        "screenPlan": plan.model_dump(),
    }
    events.append(
        create_event(
            "step.completed",
            {
                "stepId": "llm-planning",
                "step": "llm.planning",
                "label": "设计大屏方案",
                "output": output,
                "outputSummary": f"{plan.title} / {len(plan.widgets)} 个面板",
            },
        )
    )

    return {
        **state,
        "events": events,
        "intent_result": {
            **state.get("intent_result", {}),
            "dashboard": dashboard_intent,
        },
        "screen_plan": plan,
    }


def adapt_data(state: AgentGraphState) -> AgentGraphState:
    plan = state["screen_plan"]
    dashboard_intent = state.get("intent_result", {}).get("dashboard")
    filters = (
        normalize_dashboard_filters(dashboard_intent, state["profile"])
        if isinstance(dashboard_intent, dict)
        else []
    )
    events = append_event(
        state,
        "step.started",
        {
            "stepId": "adapt-data",
            "step": "adapt_data",
            "label": "准备图表数据",
            "input": {
                "filters": [item.model_dump() for item in filters],
                "widgets": [widget.model_dump() for widget in plan.widgets],
            },
        },
    )
    preview_data = build_preview_data_for_render(state["profile"], plan, filters)
    output = {
        "filters": [item.model_dump() for item in filters],
        "title": plan.title,
        "template": plan.template,
        "theme": plan.theme,
        "widgets": len(plan.widgets),
        "warnings": plan.warnings,
    }
    events.append(
        create_event(
            "step.completed",
            {
                "stepId": "adapt-data",
                "step": "adapt_data",
                "label": "准备图表数据",
                "output": output,
                "outputSummary": f"{len(plan.widgets)} 个模块已适配",
            },
        )
    )

    return {
        **state,
        "events": events,
        "render_preview_data": preview_data,
        "screen_plan": plan,
    }


def generate_dashboard_render(state: AgentGraphState) -> AgentGraphState:
    plan = state["screen_plan"]
    dataset_id = str(state["dataset_id"])
    dashboard_intent = state.get("intent_result", {}).get("dashboard")
    events = append_event(
        state,
        "tool.started",
        {
            "toolCallId": "dashboard-render",
            "tool": "generate_dashboard_render",
            "label": "生成大屏页面",
            "input": {
                "datasetId": dataset_id,
                "dashboardIntent": dashboard_intent if isinstance(dashboard_intent, dict) else None,
                "plan": plan.model_dump(),
            },
        },
    )
    query_bindings = build_query_bindings(plan, dataset_id)
    preview_data = state.get("render_preview_data") or build_preview_data(
        state["profile"], plan
    )
    spec = compile_screen_plan(plan, dataset_id)
    spec["dataBindings"] = query_bindings
    output = {
        "name": plan.title,
        "datasetId": dataset_id,
        "meta": {"template": plan.template, "warnings": plan.warnings},
        "spec": spec,
        "previewData": preview_data,
    }
    events.extend(
        [
            create_event(
                "tool.completed",
                {
                    "toolCallId": "dashboard-render",
                    "tool": "generate_dashboard_render",
                    "label": "生成大屏页面",
                    "output": output,
                    "outputSummary": plan.title,
                },
            ),
            create_event(
                "artifact.created",
                {
                    "artifactId": f"art_{uuid.uuid4().hex}",
                    "kind": "screen_preview",
                    "title": plan.title,
                    "data": {
                        "spec": spec,
                        "previewData": preview_data,
                    },
                },
            ),
        ]
    )

    return {**state, "events": events, "screen_output": output}


def llm_final_response(state: AgentGraphState) -> AgentGraphState:
    events = list(state.get("events", []))
    answer = build_llm_dashboard_answer(state) or build_dashboard_answer(state)
    events = append_answer_events({**state, "events": events}, answer)

    return {**state, "answer": answer, "events": events}


def run_model_agent(state: AgentGraphState) -> AgentGraphState:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        answer = "当前没有配置可用的大模型，无法执行真实工具调用。"
        return {
            **state,
            "answer": answer,
            "events": append_answer_events(state, answer),
        }

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": build_tool_agent_system_prompt(state["capability"]),
        },
        {
            "role": "user",
            "content": (
                f"dataset_id: {state['dataset_id']}\n"
                f"用户问题: {state['message']}\n"
                "请先根据需要调用工具。工具结果返回后，再给出简洁中文最终回复。"
            ),
        },
    ]
    events = list(state.get("events", []))
    artifacts: list[dict[str, object]] = []

    for _ in range(4):
        assistant_message = chat_completion_with_tools(
            config=llm_config,
            messages=messages,
            tools=build_agent_tools(),
            temperature=0.1,
        )

        if not assistant_message:
            answer = "大模型工具调用失败，请检查模型配置或稍后重试。"
            return {
                **state,
                "answer": answer,
                "events": append_answer_events({**state, "events": events}, answer),
            }

        messages.append(assistant_message)
        tool_calls = assistant_message.get("tool_calls")

        if not isinstance(tool_calls, list) or not tool_calls:
            content = assistant_message.get("content")
            answer = (
                content.strip() if isinstance(content, str) and content.strip() else ""
            )

            if not answer:
                return {
                    **state,
                    "answer": "",
                    "events": append_event(
                        {**state, "events": events},
                        "run.failed",
                        {"message": "模型没有返回可展示的回复内容。"},
                    ),
                }

            for artifact in artifacts:
                events.append(create_event("artifact.created", artifact))

            return {
                **state,
                "answer": answer,
                "events": append_answer_events({**state, "events": events}, answer),
            }

        for tool_call in tool_calls:
            if not isinstance(tool_call, dict):
                continue

            result = execute_model_tool_call(tool_call, state)
            events.extend(result["events"])
            artifacts.extend(result["artifacts"])
            messages.append(result["message"])

    return {
        **state,
        "answer": "",
        "events": append_event(
            {**state, "events": events},
            "run.failed",
            {"message": "模型工具调用轮次已达到上限，未返回最终回复。"},
        ),
    }


def run_rule_based_agent(state: AgentGraphState) -> AgentGraphState:
    context_state = load_context(state)

    if context_state.get("capability") == "guide":
        return guide_user(context_state)

    if state["capability"] == "builder":
        return run_screen(plan_screen(context_state))

    query_state = run_query(plan_query(context_state))

    return compose_query_answer(query_state)


def build_tool_agent_system_prompt(capability: AgentCapability) -> str:
    if capability == "builder":
        return (
            "你是智能小Q的大屏搭建智能体。用户选择数据集后，你必须通过工具完成真实处理。"
            "先调用 dataset_profile 理解数据集，再调用 screen_generate 生成 json-render 大屏 spec。"
            "不要伪造工具结果。最终回复只说明生成结果和下一步可编辑，不要输出大段 JSON。"
        )

    return (
        "你是智能小Q问数智能体。用户选择数据集后，你必须通过工具完成真实处理。"
        "先调用 dataset_profile 理解字段，再调用 dataset_query 查询数据。"
        "不要伪造工具结果。最终回复只能基于工具结果，用中文简洁回答。"
    )


def build_agent_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "dataset_profile",
                "description": "读取数据集信息，包含字段、指标、维度、时间字段和表关系。",
                "parameters": {
                    "type": "object",
                    "properties": {"dataset_id": {"type": "string"}},
                    "required": ["dataset_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "dataset_query",
                "description": "基于数据集语义画像执行受控数据查询。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "object",
                            "properties": {
                                "query_type": {
                                    "type": "string",
                                    "enum": ["metric", "trend", "breakdown", "table"],
                                },
                                "dimensions": {
                                    "type": "array",
                                    "items": {"type": "object"},
                                },
                                "measures": {
                                    "type": "array",
                                    "items": {"type": "object"},
                                },
                                "filters": {
                                    "type": "array",
                                    "items": {"type": "object"},
                                },
                                "sort": {"type": "array", "items": {"type": "object"}},
                                "limit": {"type": ["integer", "null"]},
                                "granularity": {
                                    "type": ["string", "null"],
                                    "enum": ["day", "week", "month", None],
                                },
                            },
                            "required": ["query_type"],
                        }
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "screen_generate",
                "description": "基于数据集和用户需求生成 json-render 大屏预览 spec。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dataset_id": {"type": "string"},
                        "prompt": {"type": "string"},
                        "theme": {"type": "string", "enum": ["dark", "light"]},
                    },
                    "required": ["dataset_id", "prompt"],
                },
            },
        },
    ]


def execute_model_tool_call(
    tool_call: dict[str, Any],
    state: AgentGraphState,
) -> dict[str, Any]:
    function = tool_call.get("function")
    call_id = str(tool_call.get("id") or f"call_{uuid.uuid4().hex}")

    if not isinstance(function, dict):
        return build_tool_message(call_id, "unknown", {"error": "Invalid tool call."})

    tool_name = str(function.get("name") or "unknown")
    arguments = parse_json_object(str(function.get("arguments") or "{}")) or {}
    label = get_tool_label(tool_name)
    events = [
        create_event(
            "tool.started",
            {
                "toolCallId": call_id,
                "tool": tool_name,
                "label": label,
                "input": arguments,
            },
        )
    ]
    artifacts: list[dict[str, object]] = []

    try:
        output = run_agent_tool(tool_name, arguments, state)
    except Exception as exc:
        output = {"error": str(exc)}
        events.append(
            create_event(
                "tool.failed",
                {
                    "toolCallId": call_id,
                    "tool": tool_name,
                    "label": label,
                    "output": output,
                },
            )
        )
        return {
            "artifacts": artifacts,
            "events": events,
            "message": {
                "role": "tool",
                "tool_call_id": call_id,
                "content": serialize_for_prompt(output),
            },
        }

    if tool_name == "screen_generate" and isinstance(output, dict):
        artifacts.append(
            {
                "artifactId": f"art_{uuid.uuid4().hex}",
                "kind": "screen_preview",
                "title": str(output.get("name") or "大屏预览"),
                "data": {
                    "spec": output.get("spec"),
                    "previewData": output.get("previewData"),
                },
            }
        )

    events.append(
        create_event(
            "tool.completed",
            {
                "toolCallId": call_id,
                "tool": tool_name,
                "label": label,
                "output": output,
                "outputSummary": summarize_tool_output(tool_name, output),
            },
        )
    )

    return {
        "artifacts": artifacts,
        "events": events,
        "message": {
            "role": "tool",
            "tool_call_id": call_id,
            "content": serialize_for_prompt(output),
        },
    }


def build_tool_message(
    call_id: str, tool_name: str, output: dict[str, object]
) -> dict[str, Any]:
    return {
        "artifacts": [],
        "events": [],
        "message": {
            "role": "tool",
            "tool_call_id": call_id,
            "content": serialize_for_prompt({"tool": tool_name, **output}),
        },
    }


def run_agent_tool(
    tool_name: str,
    arguments: dict[str, Any],
    state: AgentGraphState,
) -> dict[str, object]:
    dataset_id = str(arguments.get("dataset_id") or state.get("dataset_id") or "")

    if not dataset_id:
        raise ValueError("缺少 dataset_id")

    if tool_name == "dataset_profile":
        return serialize_dataset_profile(build_dataset_profile(dataset_id))

    if tool_name == "dataset_query":
        profile = build_dataset_profile(dataset_id)
        raw_query = arguments.get("query")

        if not isinstance(raw_query, dict):
            raise ValueError("缺少 query 参数")

        query = DatasetQueryRequest.model_validate(raw_query)
        return execute_dataset_query(profile, query)

    if tool_name == "screen_generate":
        screen = generate_screen_preview(
            dataset_id=dataset_id,
            prompt=str(arguments.get("prompt") or state["message"]),
            theme=str(arguments.get("theme") or "light"),
        )
        screen_payload = screen.model_dump()

        return {
            "name": screen.name,
            "datasetId": screen.dataset_id,
            "meta": screen_payload["meta"],
            "spec": screen_payload["spec"],
            "previewData": screen_payload["preview_data"],
        }

    raise ValueError(f"未知工具：{tool_name}")


def get_tool_label(tool_name: str) -> str:
    labels = {
        "dataset_profile": "读取数据集信息",
        "dataset_query": "查询图表数据",
        "screen_generate": "生成大屏页面",
    }

    return labels.get(tool_name, tool_name)


def summarize_tool_output(tool_name: str, output: dict[str, object]) -> str:
    if "error" in output:
        return str(output["error"])

    if tool_name == "dataset_profile":
        field_stats = output.get("fieldStats")
        if isinstance(field_stats, dict):
            return f"{field_stats.get('total', 0)} 个字段"

    if tool_name == "dataset_query":
        return summarize_query_result(output)

    if tool_name == "screen_generate":
        return str(output.get("name") or "大屏预览")

    return "已完成"


def load_context(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "tool.started",
        {
            "input": {"datasetId": state.get("dataset_id") or ""},
            "toolCallId": "profile",
            "tool": "dataset.profile",
            "label": "读取数据集信息",
        },
    )

    try:
        profile = build_dataset_profile(str(state["dataset_id"]))
    except Exception:
        return {
            **state,
            "capability": "guide",
            "events": events,
            "guide_reason": "当前数据集暂时不可用。",
        }

    events.extend(
        [
            create_event(
                "tool.completed",
                {
                    "toolCallId": "profile",
                    "tool": "dataset.profile",
                    "output": serialize_dataset_profile(profile),
                    "outputSummary": f"{len(profile.fields)} 个字段",
                },
            ),
            create_event(
                "context.loaded",
                {
                    "dataset": {
                        "datasetId": profile.dataset_id,
                        "datasetName": profile.dataset_name,
                    },
                    "fieldStats": {
                        "measures": len(profile.measures),
                        "dimensions": len(profile.dimensions),
                        "timeFields": len(profile.time_fields),
                    },
                },
            ),
        ]
    )

    return {**state, "events": events, "profile": profile}


def plan_query(state: AgentGraphState) -> AgentGraphState:
    profile = state["profile"]
    plan = build_llm_query_plan(state["message"], profile) or build_query_plan(
        state["message"], profile
    )
    events = append_event(
        state,
        "plan.created",
        {
            "intent": plan["intent"],
            "summary": plan["summary"],
            "fields": plan["fields"],
            "planner": plan["planner"],
            "tools": [{"tool": "dataset.query", "label": "查询数据集"}],
        },
    )

    return {**state, "events": events, "plan": plan}


def run_query(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "tool.started",
        {
            "toolCallId": "query",
            "tool": "dataset.query",
            "label": "查询数据集",
            "input": state["plan"]["query"],
            "inputSummary": state["plan"]["summary"],
        },
    )
    result = execute_dataset_query(state["profile"], state["plan"]["query"])
    events.append(
        create_event(
            "tool.completed",
            {
                "toolCallId": "query",
                "tool": "dataset.query",
                "output": result,
                "outputSummary": summarize_query_result(result),
                "resultPreview": result,
            },
        )
    )
    artifact = build_query_artifact(state["profile"].dataset_name, result)

    if artifact:
        events.append(create_event("artifact.created", artifact))

    return {**state, "events": events, "query_result": result}


def compose_query_answer(state: AgentGraphState) -> AgentGraphState:
    answer, events = compose_streaming_agent_answer(state)

    return {**state, "answer": answer, "events": events}


def plan_screen(state: AgentGraphState) -> AgentGraphState:
    plan = {
        "intent": "build_screen",
        "summary": "基于当前数据集生成大屏预览。",
        "fields": {"measures": [], "dimensions": [], "time": None},
        "planner": build_planner_meta(get_llm_config()),
    }
    events = append_event(
        state,
        "plan.created",
        {
            **plan,
            "tools": [{"tool": "screen.generate", "label": "生成大屏预览"}],
        },
    )

    return {**state, "events": events, "plan": plan}


def run_screen(state: AgentGraphState) -> AgentGraphState:
    events = append_event(
        state,
        "tool.started",
        {
            "toolCallId": "screen",
            "tool": "screen.generate",
            "label": "生成大屏预览",
            "input": {
                "datasetId": str(state["dataset_id"]),
                "prompt": state["message"],
                "theme": "light",
            },
        },
    )
    screen = generate_screen_preview(
        dataset_id=str(state["dataset_id"]),
        prompt=state["message"],
        theme="light",
    )
    screen_payload = screen.model_dump()
    events.extend(
        [
            create_event(
                "tool.completed",
                {
                    "toolCallId": "screen",
                    "tool": "screen.generate",
                    "output": {
                        "name": screen.name,
                        "datasetId": screen.dataset_id,
                        "meta": screen_payload["meta"],
                        "spec": screen_payload["spec"],
                        "previewData": screen_payload["preview_data"],
                    },
                    "outputSummary": screen.name,
                },
            ),
            create_event(
                "artifact.created",
                {
                    "artifactId": f"art_{uuid.uuid4().hex}",
                    "kind": "screen_preview",
                    "title": screen.name,
                    "data": {
                        "spec": screen_payload["spec"],
                        "previewData": screen_payload["preview_data"],
                    },
                },
            ),
        ]
    )
    answer = f"已基于「{screen.name}」生成大屏预览，可以进入大屏编辑页继续调整。"
    events = append_answer_events({**state, "events": events}, answer)

    return {**state, "answer": answer, "events": events}


def complete_run(state: AgentGraphState) -> AgentGraphState:
    if any(event["type"] == "run.failed" for event in state.get("events", [])):
        return state

    return {
        **state,
        "events": append_event(state, "run.completed", {}),
    }


def guide_user(state: AgentGraphState) -> AgentGraphState:
    reason = get_guide_reason(state)
    answer = build_llm_guide_answer(state, reason) or build_guide_answer(reason)
    events = append_event(
        state,
        "plan.created",
        {
            "fields": {"measures": [], "dimensions": [], "time": None},
            "intent": "guide",
            "planner": build_planner_meta(get_llm_config(), "langgraph-rules"),
            "summary": reason,
            "tools": [],
        },
    )
    events = append_answer_events({**state, "events": events}, answer)

    return {**state, "answer": answer, "events": events}


def route_after_start(state: AgentGraphState) -> str:
    if state["capability"] == "guide" or not state.get("dataset_id"):
        return "guide_user"

    return "run_model_agent"


def route_after_intent(state: AgentGraphState) -> str:
    intent = state.get("intent_result", {}).get("intent")

    if intent != "build_dashboard" or not state.get("dataset_id"):
        return "guide_user"

    return "load_dataset_profile"


def route_after_dataset_profile(state: AgentGraphState) -> str:
    if state.get("intent_result", {}).get("intent") == "guide" or not state.get(
        "profile"
    ):
        return "guide_user"

    return "llm_planning"


def route_after_context(state: AgentGraphState) -> str:
    if has_failed(state):
        return "guide_user"

    if state["capability"] == "builder":
        return "plan_screen"

    if state["capability"] == "qa":
        return "plan_query"

    return "guide_user"


def has_failed(state: AgentGraphState) -> bool:
    return any(event["type"] == "run.failed" for event in state.get("events", []))


def infer_agent_capability(message: str, capability: str) -> AgentCapability:
    if capability == "builder":
        return "builder"

    normalized = message.strip()

    if normalized.startswith("/搭建") or any(
        keyword in normalized for keyword in ("大屏", "看板", "仪表板", "搭建")
    ):
        return "builder"

    if normalized.startswith("/问数") or any(
        keyword in normalized
        for keyword in (
            "多少",
            "几个",
            "排名",
            "排行",
            "趋势",
            "变化",
            "按",
            "分布",
            "明细",
            "列表",
            "销售",
            "订单",
            "金额",
            "数量",
            "区域",
            "商品",
            "渠道",
            "数据",
            "分析",
        )
    ):
        return "qa"

    return "guide"


def get_guide_reason(state: AgentGraphState) -> str:
    if state.get("guide_reason"):
        return state["guide_reason"]

    if not state.get("dataset_id"):
        return "当前没有可用数据集上下文。"

    if has_failed(state):
        return "当前数据集暂时不可用。"

    return "用户问题不属于数据大屏搭建范围。"


def build_guide_answer(reason: str) -> str:
    return f"{reason}当前智能小Q只支持选择数据集后生成数据大屏。"


def build_dashboard_intent(state: AgentGraphState) -> dict[str, object]:
    if not state.get("dataset_id"):
        return {
            "intent": "guide",
            "requiresDataset": True,
            "summary": "缺少数据集",
        }

    llm_config = get_llm_config()

    if not llm_config.enabled:
        return {
            "intent": "build_dashboard",
            "requiresDataset": False,
            "summary": "生成数据大屏",
        }

    content = chat_completion(
        config=llm_config,
        max_tokens=1600,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是数据大屏智能体的意图识别节点。只能输出 JSON object。"
                    "当前产品只支持生成数据大屏，不支持问数、文件上传、普通闲聊。"
                    "如果用户请求可以理解为生成、搭建、调整数据大屏，intent=build_dashboard；"
                    "否则 intent=guide。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"用户输入：{state['message']}\n"
                    f"是否已选择数据集：{bool(state.get('dataset_id'))}\n"
                    '请输出 JSON：{"intent":"build_dashboard|guide","requiresDataset":false,"summary":"简短说明"}'
                ),
            },
        ],
        temperature=0,
    )
    parsed = parse_json_object(content) or {}
    intent = parsed.get("intent")

    return {
        "intent": "build_dashboard" if intent == "build_dashboard" else "guide",
        "requiresDataset": bool(parsed.get("requiresDataset"))
        or not state.get("dataset_id"),
        "summary": str(parsed.get("summary") or "已识别意图"),
    }


def build_llm_dashboard_render_intent(profile: object, message: str) -> dict[str, object]:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        return {
            **build_rule_dashboard_render_intent(profile, message),
            "plannerSource": "rule",
            "warnings": ["未配置可用大模型，已使用规则生成。"],
        }

    content = chat_completion(
        config=llm_config,
        max_tokens=1600,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是 BI 大屏的数据分析意图识别节点。只能输出 JSON object，不能输出解释。"
                    "不要输出推理过程，不要输出 markdown。"
                    "你只负责识别 filters/timeRange/panels，不生成 SQL，不生成 json-render spec。"
                    "字段必须使用给定 fieldId。面板 type 只能是 MetricCard、ProgressCard、AreaChart、LineChart、MultiLineChart、BarChart、MultiBarChart、RankList、PieChart、DonutChart、RadarChart、RadialChart、DataTable。"
                    "你必须按照 BI 大屏信息层级规划面板顺序：先主洞察，再关键指标，再拆解分析，最后明细。"
                ),
            },
            {
                "role": "user",
                "content": build_dashboard_render_intent_prompt(profile, message),
            },
        ],
        response_format=True,
        temperature=0.45,
    )
    parsed = parse_json_object(content)

    if not parsed:
        return {
            **build_rule_dashboard_render_intent(profile, message),
            "plannerSource": "rule",
            "warnings": ["大模型未返回合法 JSON，已使用规则生成。"],
        }

    normalized = normalize_dashboard_render_intent(parsed, profile, message)
    if normalized:
        return {**normalized, "plannerSource": "llm"}

    return {
        **build_rule_dashboard_render_intent(profile, message),
        "plannerSource": "rule",
        "warnings": ["大模型规划字段不合法，已使用规则生成。"],
    }


def build_dashboard_render_intent_prompt(profile: object, message: str) -> str:
    fields = [
        {
            "aggregation": field.aggregation,
            "dataType": field.data_type,
            "fieldId": field.field_id,
            "isIdentifier": is_identifier_field(field),
            "label": field.display_name,
            "semanticType": field.semantic_type,
        }
        for field in profile.fields
    ]

    return (
        f"用户需求：{message}\n"
        "数据集："
        f"{serialize_for_prompt({'datasetId': profile.dataset_id, 'datasetName': profile.dataset_name, 'fields': fields})}\n"
        f"{build_dashboard_layout_guidelines_prompt()}"
        "标题生成规则：title 必须是 4-12 个字的业务化短标题，不能直接复制用户问题；"
        "去掉“基于这个数据集”“帮我”“生成一个”“对比”“分析”等口语指令词；"
        "优先使用“趋势分析”“综合看板”“结构分析”“明细看板”等简短标题。\n"
        "只输出 JSON，不要 markdown，不要解释。格式："
        '{"intent":"overview|trend_analysis|dimension_breakdown|detail_table",'
        '"title":"大屏标题",'
        '"filters":[{"fieldId":"fieldId","op":"=|!=|in|>|<|>=|<=","value":"值"}],'
        '"timeRange":{"fieldId":"时间fieldId或null","preset":"last_7_days|last_30_days|last_12_months|null"},'
        '"panels":[{"id":"英文唯一ID","type":"MetricCard|ProgressCard|AreaChart|LineChart|MultiLineChart|BarChart|MultiBarChart|RankList|PieChart|DonutChart|RadarChart|RadialChart|DataTable",'
        '"title":"面板标题","x":{"fieldId":"维度或时间fieldId或null"},'
        '"y":{"fieldId":"指标fieldId或null","fieldIds":["多系列指标fieldId"],"aggregation":"sum|avg|count|max|min"},"limit":10}]}'
        "字段与图表约束：panels 4 到 8 个，必须根据用户问题选择不同组件组合；"
        "如果用户关注趋势，多使用时间字段和度量字段；如果关注结构，多使用维度字段和度量字段；如果关注排行，优先 RankList/BarChart；"
        "MetricCard/ProgressCard 需要 y.fieldId；AreaChart/LineChart 需要时间 x 和单个指标 y.fieldId；MultiLineChart 需要时间 x 和至少两个指标 y.fieldIds；BarChart/RankList/PieChart/DonutChart/RadarChart/RadialChart 需要维度 x 和单个指标 y.fieldId；MultiBarChart 需要维度 x 和至少两个指标 y.fieldIds；"
        "除非用户明确要求编号，不要选 isIdentifier=true 的字段做拆解维度。"
    )


def build_dashboard_layout_guidelines_prompt() -> str:
    return (
        "BI 大屏布局规划规范，完整规则见 docs/dashboard-layout-guidelines.md。"
        "规范是领域无关的，只能基于 intent、panel.type、xField/yField、字段语义类型和 panels 顺序规划，不能绑定具体业务主题。\n"
        "1. 信息层级：panels 顺序必须表达 主洞察 panel -> 关键摘要 panels -> 辅助分析 panels -> 明细 panel。\n"
        "2. intent 选择："
        "overview=整体看板/总览/概览/综合分析；"
        "trend_analysis=时间变化/走势/增长/下降/波动/同比/环比/最近N个周期；"
        "dimension_breakdown=维度拆解/占比/贡献/排名/结构对比；"
        "detail_table=明细/清单/列表/记录/核对数据。\n"
        "3. intent 对应 panel 顺序："
        "trend_analysis 的第一个 panel 必须是 AreaChart 或 LineChart；"
        "dimension_breakdown 的第一个分析图必须是核心维度拆解图；"
        "detail_table 必须包含 DataTable 且 DataTable 靠前；"
        "overview 可以先放 KPI，但必须包含解释性趋势或拆解图。\n"
        "4. 组件选择：MetricCard/ProgressCard 用于关键摘要；"
        "AreaChart/LineChart 用于单指标时间趋势；MultiLineChart 用于多指标时间趋势；"
        "BarChart/RankList 用于单指标排序对比；MultiBarChart 用于多指标分类对比；"
        "PieChart/DonutChart/RadarChart/RadialChart 只用于少量分类占比或极坐标对比；凡是需要单行展示、通栏展示或主图展示的位置，禁止使用这些紧凑型图表；紧凑型图表必须和其他组件配对出现在同一行，不能单独成行；"
        "DataTable 只用于明细核对。\n"
        "5. 禁止坏味道：不要把 KPI 永远放在最前面；"
        "不要输出多个相似占比图；"
        "不要让单个 RankList 或 DataTable 孤立掉到最后；"
        "不要固定复用同一组指标或同一组 panel 结构。\n"
        "6. 数量约束：简单问题 4-5 个 panels，复杂综合分析 6-8 个 panels，每个 panel 必须服务用户问题，不要为了凑数加无关图。\n"
    )


def normalize_dashboard_render_intent(
    raw_intent: dict[str, object], profile: object, message: str
) -> dict[str, object] | None:
    panels = []

    for index, raw_panel in enumerate(raw_intent.get("panels") or [], start=1):
        if not isinstance(raw_panel, dict):
            continue

        panel = normalize_dashboard_panel(raw_panel, profile, index)
        if panel:
            panel = repair_dashboard_panel_fields(panel, profile, message)
            panels.append(panel)

    if not panels:
        return None

    return {
        "filters": normalize_dashboard_filter_payloads(raw_intent.get("filters"), profile),
        "intent": str(raw_intent.get("intent") or "overview"),
        "panels": panels[:8],
        "timeRange": normalize_dashboard_time_range(raw_intent.get("timeRange"), profile),
        "title": normalize_dashboard_title(
            raw_intent.get("title"),
            intent=str(raw_intent.get("intent") or "overview"),
        ),
    }


def normalize_dashboard_panel(
    raw_panel: dict[str, object], profile: object, index: int
) -> dict[str, object] | None:
    panel_type = raw_panel.get("type")
    if panel_type not in {
        "MetricCard",
        "ProgressCard",
        "AreaChart",
        "LineChart",
        "MultiLineChart",
        "BarChart",
        "MultiBarChart",
        "RankList",
        "PieChart",
        "DonutChart",
        "RadarChart",
        "RadialChart",
        "DataTable",
    }:
        return None

    raw_x = raw_panel.get("x") if isinstance(raw_panel.get("x"), dict) else {}
    raw_y = raw_panel.get("y") if isinstance(raw_panel.get("y"), dict) else {}
    x_field = normalize_any_field_id(raw_x.get("fieldId"), profile) if isinstance(raw_x, dict) else None
    y_field = normalize_field_id(raw_y.get("fieldId"), profile.measures) if isinstance(raw_y, dict) else None
    y_fields = (
        normalize_measure_field_ids(raw_y.get("fieldIds"), profile)
        if isinstance(raw_y, dict)
        else []
    )
    aggregation = normalize_aggregation_value(raw_y.get("aggregation") if isinstance(raw_y, dict) else None)

    if panel_type in {"MetricCard", "ProgressCard"} and not y_field:
        return None
    if panel_type in {"AreaChart", "LineChart"} and not (
        x_field in profile.time_fields and y_field
    ):
        return None
    if panel_type == "MultiLineChart" and not (
        x_field in profile.time_fields and len(y_fields) >= 2
    ):
        return None
    if panel_type in {
        "BarChart",
        "RankList",
        "PieChart",
        "DonutChart",
        "RadarChart",
        "RadialChart",
    } and not (x_field in profile.dimensions and y_field):
        return None
    if panel_type == "MultiBarChart" and not (
        x_field in profile.dimensions and len(y_fields) >= 2
    ):
        return None
    if panel_type == "DataTable" and not (x_field or y_field):
        return None

    panel_id = normalize_plan_key(str(raw_panel.get("id") or f"panel-{index}"), f"panel-{index}")

    return {
        "aggregation": aggregation,
        "id": panel_id,
        "limit": normalize_limit(raw_panel.get("limit")) or 20,
        "title": str(raw_panel.get("title") or panel_id),
        "type": panel_type,
        "xField": x_field,
        "yField": y_field,
        "yFields": y_fields,
    }


def repair_dashboard_panel_fields(
    panel: dict[str, object], profile: object, message: str
) -> dict[str, object]:
    panel_type = panel.get("type")
    x_field = panel.get("xField")

    if panel_type in {
        "BarChart",
        "RankList",
        "PieChart",
        "DonutChart",
        "RadarChart",
        "RadialChart",
    } and isinstance(x_field, str):
        field = get_profile_field(profile, x_field)
        if field and is_identifier_field(field):
            replacement = find_best_dimension(message, profile)
            if replacement:
                return {**panel, "xField": replacement}

    return panel


def normalize_measure_field_ids(raw_value: object, profile: object) -> list[str]:
    if not isinstance(raw_value, list):
        return []

    fields: list[str] = []
    for item in raw_value:
        field_id = normalize_field_id(item, profile.measures)
        if field_id and field_id not in fields:
            fields.append(field_id)

    return fields


def build_rule_dashboard_render_intent(profile: object, message: str) -> dict[str, object]:
    measure = find_best_measure(message, profile)
    dimension = find_best_dimension(message, profile)
    breakdown_measure = find_breakdown_measure(message, profile) or measure
    breakdown_dimensions = find_mentioned_dimensions(message, profile) or (
        [dimension] if dimension else []
    )
    time_field = find_best_time_field(message, profile)
    panels: list[dict[str, object]] = []

    if measure:
        panels.append(
            {
                "aggregation": get_profile_field_aggregation(profile, measure),
                "id": "metric-primary",
                "limit": 1,
                "title": get_profile_field_label(profile, measure),
                "type": "MetricCard",
                "xField": None,
                "yField": measure,
            }
        )
    if measure and time_field:
        panels.append(
            {
                "aggregation": get_profile_field_aggregation(profile, measure),
                "id": "trend-primary",
                "limit": 12,
                "title": f"{get_profile_field_label(profile, measure)}趋势",
                "type": "LineChart",
                "xField": time_field,
                "yField": measure,
            }
        )
    for index, breakdown_dimension in enumerate(breakdown_dimensions[:2], start=1):
        if not (breakdown_measure and breakdown_dimension):
            continue
        panels.append(
            {
                "aggregation": get_profile_field_aggregation(profile, breakdown_measure),
                "id": "breakdown-primary" if index == 1 else f"breakdown-{index}",
                "limit": 10,
                "title": (
                    f"{get_profile_field_label(profile, breakdown_dimension)}"
                    f" · {get_profile_field_label(profile, breakdown_measure)}排行"
                ),
                "type": "BarChart",
                "xField": breakdown_dimension,
                "yField": breakdown_measure,
            }
        )

    panels.append(
        {
            "aggregation": get_profile_field_aggregation(profile, measure) if measure else "sum",
            "id": "detail-table",
            "limit": 20,
            "title": "明细数据",
            "type": "DataTable",
            "xField": time_field or dimension,
            "yField": measure,
        }
    )

    return {
        "filters": [],
        "intent": "overview",
        "panels": panels,
        "timeRange": {"fieldId": time_field, "preset": None} if time_field else None,
        "title": infer_dashboard_title(message, profile.dataset_name),
    }


def build_screen_plan_from_dashboard_intent(
    profile: object, message: str, intent: dict[str, object]
) -> ScreenPlan:
    panels = intent.get("panels") if isinstance(intent.get("panels"), list) else []
    widgets: list[WidgetPlan] = []

    for index, panel in enumerate(panels[:10], start=1):
        if not isinstance(panel, dict):
            continue

        slot = normalize_plan_key(
            str(panel.get("id") or f"panel-{index}"),
            f"panel-{index}",
        )
        widget = build_widget_from_panel(panel, slot)
        if widget:
            widgets.append(widget)

    if not widgets:
        return build_initial_screen_plan(profile=profile, prompt=message, theme="light")

    return ScreenPlan(
        title=str(intent.get("title") or infer_dashboard_title(message, profile.dataset_name)),
        template=normalize_screen_template(intent.get("intent")),
        theme="light",
        widgets=widgets,
        warnings=[],
    )


def normalize_screen_template(intent: object) -> str:
    if intent == "trend_analysis":
        return "trend_analysis"
    if intent == "dimension_breakdown":
        return "dimension_breakdown"
    if intent == "detail_table":
        return "complex_business_overview"

    return "executive_overview"


def build_widget_from_panel(panel: dict[str, object], slot: str) -> WidgetPlan | None:
    panel_type = panel.get("type")
    query_type = {
        "MetricCard": "metric",
        "ProgressCard": "metric",
        "AreaChart": "trend",
        "LineChart": "trend",
        "MultiLineChart": "trend",
        "BarChart": "breakdown",
        "MultiBarChart": "breakdown",
        "RankList": "breakdown",
        "PieChart": "breakdown",
        "DonutChart": "breakdown",
        "RadarChart": "breakdown",
        "RadialChart": "breakdown",
        "DataTable": "table",
    }.get(str(panel_type))
    widget_type = {
        "MetricCard": "metric",
        "ProgressCard": "progress",
        "AreaChart": "area",
        "LineChart": "line",
        "MultiLineChart": "multi_line",
        "BarChart": "bar",
        "MultiBarChart": "multi_bar",
        "RankList": "rank",
        "PieChart": "pie",
        "DonutChart": "donut",
        "RadarChart": "radar",
        "RadialChart": "radial",
        "DataTable": "table",
    }.get(str(panel_type))

    if not query_type or not widget_type:
        return None

    panel_id = str(panel.get("id") or slot)
    x_field = panel.get("xField") if isinstance(panel.get("xField"), str) else None
    y_field = panel.get("yField") if isinstance(panel.get("yField"), str) else None
    y_fields = [
        item
        for item in panel.get("yFields", [])
        if isinstance(item, str)
    ] if isinstance(panel.get("yFields"), list) else []

    return WidgetPlan(
        id=panel_id,
        slot=slot,
        widget_type=widget_type,
        title=str(panel.get("title") or panel_id),
        binding_key=f"{panel_id}-binding",
        binding=WidgetBindingPlan(
            query_type=query_type,
            fields=BindingFieldPlan(
                measure=y_field,
                measures=y_fields,
                dimension=x_field if query_type in {"breakdown", "table"} else None,
                time=x_field if query_type == "trend" else None,
            ),
            aggregation=normalize_aggregation_value(panel.get("aggregation")),
            granularity="month" if query_type == "trend" else None,
            limit=normalize_limit(panel.get("limit")) or (12 if query_type == "trend" else 20),
        ),
    )


def build_preview_data_for_render(
    profile: object, plan: ScreenPlan, filters: list[DatasetFilterSpec]
) -> dict[str, object]:
    preview_data: dict[str, object] = {}

    for widget in plan.widgets:
        query_request = build_dataset_query_for_widget(profile, widget, filters)
        preview_data[widget.binding_key] = execute_dataset_query(profile, query_request)

    return preview_data


def build_dataset_query_for_widget(
    profile: object, widget: WidgetPlan, filters: list[DatasetFilterSpec]
) -> DatasetQueryRequest:
    binding = widget.binding
    fields = binding.fields
    dimensions: list[DatasetQueryFieldRef] = []
    measures: list[DatasetMeasureSpec] = []

    if binding.query_type == "trend" and fields.time:
        dimensions.append(DatasetQueryFieldRef(field=fields.time, alias="x"))
    elif binding.query_type in {"breakdown", "table"} and fields.dimension:
        dimensions.append(
            DatasetQueryFieldRef(
                field=fields.dimension,
                alias="label" if binding.query_type == "breakdown" else get_profile_field_label(profile, fields.dimension),
            )
        )

    if binding.query_type == "table" and fields.time:
        dimensions.insert(0, DatasetQueryFieldRef(field=fields.time, alias=get_profile_field_label(profile, fields.time)))

    if fields.measure and binding.aggregation and binding.query_type != "table":
        measures.append(
            DatasetMeasureSpec(
                field=fields.measure,
                aggregation=binding.aggregation,
                alias="y" if binding.query_type == "trend" else "value",
            )
        )
    elif fields.measures and binding.aggregation and binding.query_type != "table":
        measures.extend(
            DatasetMeasureSpec(
                field=field_id,
                aggregation=binding.aggregation,
                alias=get_profile_field_label(profile, field_id),
            )
            for field_id in fields.measures
        )
    elif fields.measure and binding.query_type == "table":
        dimensions.append(DatasetQueryFieldRef(field=fields.measure, alias=get_profile_field_label(profile, fields.measure)))

    sort = []
    if binding.query_type == "trend":
        sort.append({"field": "x", "direction": "asc"})
    elif binding.query_type == "breakdown" and measures:
        sort.append({"field": measures[0].alias, "direction": "desc"})

    return DatasetQueryRequest(
        query_type=binding.query_type,
        dimensions=dimensions,
        measures=measures,
        filters=filters,
        sort=sort,
        limit=binding.limit,
        granularity=binding.granularity,
    )


def normalize_dashboard_filter_payloads(raw_filters: object, profile: object) -> list[dict[str, object]]:
    if not isinstance(raw_filters, list):
        return []

    filters: list[dict[str, object]] = []
    for item in raw_filters:
        if not isinstance(item, dict):
            continue

        field_id = normalize_any_field_id(item.get("fieldId"), profile)
        op = item.get("op")
        value = item.get("value")

        if field_id and op in {"=", "!=", "in", ">", "<", ">=", "<="} and value not in (None, ""):
            filters.append({"field": field_id, "op": op, "value": value})

    return filters


def normalize_dashboard_filters(raw_intent: object, profile: object) -> list[DatasetFilterSpec]:
    if not isinstance(raw_intent, dict):
        return []

    return [
        DatasetFilterSpec.model_validate(item)
        for item in normalize_dashboard_filter_payloads(raw_intent.get("filters"), profile)
    ]


def normalize_dashboard_time_range(raw_time_range: object, profile: object) -> dict[str, object] | None:
    if not isinstance(raw_time_range, dict):
        return None

    field_id = normalize_field_id(raw_time_range.get("fieldId"), profile.time_fields)
    preset = raw_time_range.get("preset")

    if not field_id:
        return None

    return {"fieldId": field_id, "preset": preset if isinstance(preset, str) else None}


def normalize_any_field_id(value: object, profile: object) -> str | None:
    return normalize_field_id(value, [field.field_id for field in profile.fields])


def normalize_aggregation_value(value: object) -> str:
    return str(value) if value in {"sum", "avg", "count", "max", "min"} else "sum"


def normalize_plan_key(value: str, fallback: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    return normalized or fallback


def infer_dashboard_title(message: str, dataset_name: str) -> str:
    return normalize_dashboard_title(None, intent="overview") or (dataset_name or "数据大屏")[:12]


def normalize_dashboard_title(raw_title: object, intent: str) -> str:
    title = str(raw_title or "").strip()
    forbidden_fragments = [
        "基于这个数据集",
        "基于数据集",
        "帮我",
        "请",
        "生成一个",
        "生成",
        "这个数据集",
        "数据集",
    ]

    for fragment in forbidden_fragments:
        title = title.replace(fragment, "")

    title = title.strip(" ，,。.!！?？")
    if 2 <= len(title) <= 12 and not looks_like_user_prompt(title):
        return title

    fallback_titles = {
        "trend_analysis": "趋势分析",
        "dimension_breakdown": "结构分析",
        "detail_table": "明细看板",
        "overview": "综合看板",
    }

    return fallback_titles.get(intent, "数据大屏")


def looks_like_user_prompt(title: str) -> bool:
    prompt_markers = ["对比", "分析", "查看", "展示", "最近", "需要", "重点"]

    return len(title) > 12 or any(marker in title for marker in prompt_markers)


def summarize_screen_output(output: dict[str, object]) -> dict[str, object]:
    preview_data = output.get("previewData")
    meta = output.get("meta")
    spec = output.get("spec")
    data_bindings = spec.get("dataBindings") if isinstance(spec, dict) else None

    return {
        "name": output.get("name"),
        "template": meta.get("template") if isinstance(meta, dict) else None,
        "bindingCount": len(data_bindings) if isinstance(data_bindings, dict) else 0,
        "previewDataKeys": list(preview_data.keys())
        if isinstance(preview_data, dict)
        else [],
    }


def build_llm_dashboard_answer(state: AgentGraphState) -> str | None:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        return None

    content = chat_completion(
        config=llm_config,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是数据大屏搭建结果回复节点。只能基于已完成的大屏规划和生成结果回答，"
                    "不能编造额外模块或数据。回答中文，简洁自然，不输出 JSON。"
                    "禁止问候、寒暄和反问。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"用户需求：{state['message']}\n"
                    f"大屏规划：{serialize_for_prompt(state['screen_plan'].model_dump())}\n"
                    f"生成结果摘要：{serialize_for_prompt(summarize_screen_output(state['screen_output']))}\n"
                    '请输出 JSON：{"answer":"最终回复"}'
                ),
            },
        ],
        temperature=0.3,
    )
    parsed = parse_json_object(content)

    if not parsed:
        return None

    answer = parsed.get("answer")

    return answer.strip() if isinstance(answer, str) and answer.strip() else None


def build_dashboard_answer(state: AgentGraphState) -> str:
    output = state["screen_output"]
    summary = summarize_screen_output(output)

    return (
        f"已生成「{summary.get('name') or '数据大屏'}」，"
        f"包含 {summary.get('bindingCount') or 0} 个数据绑定。"
    )


def build_llm_guide_answer(state: AgentGraphState, reason: str) -> str | None:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        return None

    content = chat_completion(
        config=llm_config,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是智能小Q的产品引导助手。你只介绍当前产品能力，不编造数据、"
                    "不声称已经查询或生成大屏。回答用中文，简洁自然。"
                    "当前产品只支持选择数据集后搭建数据大屏。"
                    "如果缺少数据集，要明确提示先选择数据集。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"用户输入：{state['message']}\n"
                    f"当前原因：{reason}\n"
                    '请输出 JSON：{"answer":"给用户的回复"}'
                ),
            },
        ],
        temperature=0.4,
    )
    parsed = parse_json_object(content)

    if not parsed:
        return None

    answer = parsed.get("answer")

    return answer.strip() if isinstance(answer, str) and answer.strip() else None


def build_llm_query_plan(message: str, profile: object) -> dict[str, object] | None:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        return None

    content = chat_completion(
        config=llm_config,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是 BI 数据集问数规划器。只能输出 JSON object，不能输出解释。"
                    "你不能生成 SQL，只能选择给定字段并生成受控查询计划。"
                ),
            },
            {
                "role": "user",
                "content": build_plan_prompt(message, profile),
            },
        ],
        temperature=0,
    )
    parsed = parse_json_object(content)

    if not parsed:
        return None

    return normalize_llm_plan(parsed, message, profile, llm_config)


def build_plan_prompt(message: str, profile: object) -> str:
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
        "用户问题：\n"
        f"{message}\n\n"
        "数据集：\n"
        f"{profile.dataset_name}\n\n"
        "可用字段：\n"
        f"{fields}\n\n"
        "请输出 JSON，格式如下：\n"
        "{"
        '"intent":"query_metric|breakdown|trend|table",'
        '"summary":"一句话说明查询计划",'
        '"measure":"指标 fieldId 或 null",'
        '"dimension":"维度 fieldId 或 null",'
        '"time":"时间 fieldId 或 null",'
        '"limit":10'
        "}\n"
        "约束：fieldId 必须来自可用字段；trend 必须有 time；breakdown 必须有 dimension；"
        "query_metric 必须有 measure；table 可以不需要 measure。"
    )


def normalize_llm_plan(
    raw_plan: dict[str, object],
    message: str,
    profile: object,
    llm_config: LlmConfig,
) -> dict[str, object] | None:
    intent = raw_plan.get("intent")
    measure = normalize_field_id(raw_plan.get("measure"), profile.measures)
    dimension = normalize_field_id(raw_plan.get("dimension"), profile.dimensions)
    time_field = normalize_field_id(raw_plan.get("time"), profile.time_fields)
    summary = str(raw_plan.get("summary") or "按问题生成查询计划。")
    limit = normalize_limit(raw_plan.get("limit"))

    if intent not in {"query_metric", "breakdown", "trend", "table"}:
        return None

    if intent == "trend":
        measure = measure or (profile.measures[0] if profile.measures else None)
        time_field = time_field or profile.default_time_field
        if not measure or not time_field:
            return None
        query = DatasetQueryRequest(
            dimensions=[DatasetQueryFieldRef(field=time_field, alias="x")],
            granularity="month",
            limit=limit or 12,
            measures=[
                DatasetMeasureSpec(
                    aggregation=get_profile_field_aggregation(profile, measure),
                    alias="y",
                    field=measure,
                )
            ],
            query_type="trend",
        )
        return build_plan_payload(
            "trend",
            summary,
            profile,
            query,
            measure,
            None,
            time_field,
            llm_config,
            planner_mode="langgraph-llm",
        )

    if intent == "breakdown":
        measure = measure or (profile.measures[0] if profile.measures else None)
        dimension = dimension or (profile.dimensions[0] if profile.dimensions else None)
        if not measure or not dimension:
            return None
        query = DatasetQueryRequest(
            dimensions=[DatasetQueryFieldRef(field=dimension, alias="label")],
            limit=limit or 10,
            measures=[
                DatasetMeasureSpec(
                    aggregation=get_profile_field_aggregation(profile, measure),
                    alias="value",
                    field=measure,
                )
            ],
            query_type="breakdown",
        )
        return build_plan_payload(
            "breakdown",
            summary,
            profile,
            query,
            measure,
            dimension,
            None,
            llm_config,
            planner_mode="langgraph-llm",
        )

    if intent == "table":
        selected_fields = [
            field_id
            for field_id in [time_field, dimension, measure]
            if isinstance(field_id, str)
        ]
        if not selected_fields:
            selected_fields = [
                *profile.time_fields[:1],
                *profile.dimensions[:4],
                *profile.measures[:2],
            ]
        query = DatasetQueryRequest(
            dimensions=[
                DatasetQueryFieldRef(
                    field=field, alias=get_profile_field_label(profile, field)
                )
                for field in selected_fields
            ],
            limit=limit or 20,
            query_type="table",
        )
        return build_plan_payload(
            "table",
            summary,
            profile,
            query,
            measure,
            dimension,
            time_field,
            llm_config,
            planner_mode="langgraph-llm",
        )

    measure = measure or find_best_field(message, profile.measures, profile)
    if not measure:
        return None
    query = DatasetQueryRequest(
        measures=[
            DatasetMeasureSpec(
                aggregation=get_profile_field_aggregation(profile, measure),
                alias="value",
                field=measure,
            )
        ],
        query_type="metric",
    )
    return build_plan_payload(
        "query_metric",
        summary,
        profile,
        query,
        measure,
        None,
        None,
        llm_config,
        planner_mode="langgraph-llm",
    )


def normalize_field_id(value: object, allowed_fields: list[str]) -> str | None:
    if not isinstance(value, str) or not value:
        return None

    return value if value in allowed_fields else None


def normalize_limit(value: object) -> int | None:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        return None

    return min(max(limit, 1), 100)


def build_query_plan(message: str, profile: object) -> dict[str, object]:
    llm_config = get_llm_config()
    measure = (
        find_best_field(message, profile.measures, profile)
        if profile.measures
        else None
    )
    dimension = (
        find_best_field(message, profile.dimensions, profile)
        if profile.dimensions
        else None
    )
    time_field = (
        find_best_field(message, profile.time_fields, profile)
        or profile.default_time_field
    )

    if not measure and profile.measures:
        measure = profile.measures[0]

    if not measure:
        fields = [
            *profile.time_fields[:1],
            *profile.dimensions[:4],
            *profile.measures[:2],
        ]
        query = DatasetQueryRequest(
            query_type="table",
            dimensions=[
                DatasetQueryFieldRef(
                    field=field, alias=get_profile_field_label(profile, field)
                )
                for field in fields
            ],
            limit=20,
        )
        return build_plan_payload(
            "table", "查询明细表格。", profile, query, None, None, None, llm_config
        )

    if time_field and any(
        keyword in message
        for keyword in ("趋势", "变化", "按月", "按天", "按周", "最近")
    ):
        query = DatasetQueryRequest(
            query_type="trend",
            dimensions=[DatasetQueryFieldRef(field=time_field, alias="x")],
            measures=[
                DatasetMeasureSpec(
                    field=measure,
                    aggregation=get_profile_field_aggregation(profile, measure),
                    alias="y",
                )
            ],
            granularity="month",
            limit=12,
        )
        return build_plan_payload(
            "trend",
            "按时间趋势查询。",
            profile,
            query,
            measure,
            None,
            time_field,
            llm_config,
        )

    if dimension and any(
        keyword in message
        for keyword in ("按", "分布", "排行", "渠道", "区域", "分类", "商品")
    ):
        query = DatasetQueryRequest(
            query_type="breakdown",
            dimensions=[DatasetQueryFieldRef(field=dimension, alias="label")],
            measures=[
                DatasetMeasureSpec(
                    field=measure,
                    aggregation=get_profile_field_aggregation(profile, measure),
                    alias="value",
                )
            ],
            limit=10,
        )
        return build_plan_payload(
            "breakdown",
            "按维度拆解查询。",
            profile,
            query,
            measure,
            dimension,
            None,
            llm_config,
        )

    query = DatasetQueryRequest(
        query_type="metric",
        measures=[
            DatasetMeasureSpec(
                field=measure,
                aggregation=get_profile_field_aggregation(profile, measure),
                alias="value",
            )
        ],
    )
    return build_plan_payload(
        "query_metric",
        "查询核心指标。",
        profile,
        query,
        measure,
        None,
        None,
        llm_config,
    )


def build_plan_payload(
    intent: str,
    summary: str,
    profile: object,
    query: DatasetQueryRequest,
    measure: str | None,
    dimension: str | None,
    time_field: str | None,
    llm_config: LlmConfig,
    planner_mode: str = "langgraph-rules",
) -> dict[str, object]:
    return {
        "fields": {
            "measures": format_plan_fields(profile, [measure] if measure else []),
            "dimensions": format_plan_fields(profile, [dimension] if dimension else []),
            "time": format_plan_field(profile, time_field) if time_field else None,
        },
        "intent": intent,
        "planner": build_planner_meta(llm_config, planner_mode),
        "query": query,
        "summary": summary,
    }


def build_planner_meta(
    llm_config: LlmConfig, mode: str = "langgraph-rules"
) -> dict[str, object]:
    return {
        "llm": {
            "enabled": llm_config.enabled,
            "model": llm_config.model,
            "provider": llm_config.provider,
        },
        "mode": mode,
    }


def find_best_field(message: str, field_ids: list[str], profile: object) -> str | None:
    for field_id in field_ids:
        field = next(
            (item for item in profile.fields if item.field_id == field_id), None
        )
        if not field:
            continue
        names = [field.display_name, field.source_name, field.source_field or ""]
        if any(name and name.rsplit(".", 1)[-1] in message for name in names):
            return field_id

    return field_ids[0] if field_ids else None


def get_profile_field(profile: object, field_id: str) -> object | None:
    return next((item for item in profile.fields if item.field_id == field_id), None)


def find_best_measure(message: str, profile: object) -> str | None:
    return find_best_field_by_score(message, profile.measures, profile, score_measure_field)


def find_best_dimension(message: str, profile: object) -> str | None:
    return find_best_field_by_score(
        message, profile.dimensions, profile, score_dimension_field
    )


def find_best_time_field(message: str, profile: object) -> str | None:
    return (
        find_best_field_by_score(message, profile.time_fields, profile, score_time_field)
        or profile.default_time_field
    )


def find_breakdown_measure(message: str, profile: object) -> str | None:
    if any(word in message for word in ["订单量", "订单数", "销量", "数量"]):
        return find_best_field_by_score(
            "销量 数量 quantity", profile.measures, profile, score_measure_field
        )

    return find_best_measure(message, profile)


def find_mentioned_dimensions(message: str, profile: object) -> list[str]:
    candidates: list[str | None] = []
    if "区域" in message or "地区" in message:
        candidates.append(
            find_best_field_by_score(
                "区域 region_name", profile.dimensions, profile, score_dimension_field
            )
        )
    if "渠道" in message:
        candidates.append(
            find_best_field_by_score(
                "渠道 channel_name", profile.dimensions, profile, score_dimension_field
            )
        )
    if "分类" in message or "品类" in message:
        candidates.append(
            find_best_field_by_score(
                "分类 category", profile.dimensions, profile, score_dimension_field
            )
        )
    if "商品" in message or "产品" in message:
        candidates.append(
            find_best_field_by_score(
                "商品 product_name", profile.dimensions, profile, score_dimension_field
            )
        )
    if "品牌" in message:
        candidates.append(
            find_best_field_by_score(
                "品牌 brand", profile.dimensions, profile, score_dimension_field
            )
        )
    if "门店" in message or "店铺" in message:
        candidates.append(
            find_best_field_by_score(
                "门店 store_name", profile.dimensions, profile, score_dimension_field
            )
        )

    result: list[str] = []
    for field_id in candidates:
        if field_id and field_id not in result:
            result.append(field_id)

    return result


def find_best_field_by_score(
    message: str,
    field_ids: list[str],
    profile: object,
    scorer: Callable[[str, object], float],
) -> str | None:
    best_field_id = None
    best_score = -10_000

    for index, field_id in enumerate(field_ids):
        field = next((item for item in profile.fields if item.field_id == field_id), None)
        if not field:
            continue

        score = scorer(message, field) - index * 0.01
        if score > best_score:
            best_field_id = field_id
            best_score = score

    return best_field_id


def score_measure_field(message: str, field: object) -> float:
    key = get_field_search_text(field)
    score = 0.0

    if any(word in message for word in ["销售额", "销售金额", "营收", "收入", "金额"]):
        score += score_keyword_match(key, ["sales_amount", "amount", "revenue", "gmv"])
    if any(word in message for word in ["订单量", "订单数", "订单"]):
        score += score_keyword_match(key, ["order_count", "orders", "quantity"])
    if any(word in message for word in ["销量", "数量", "件数"]):
        score += score_keyword_match(key, ["quantity", "qty", "sale_qty"])
    if any(word in message for word in ["利润", "毛利"]):
        score += score_keyword_match(key, ["gross_profit", "profit", "margin"])
    if "折扣" in message:
        score += score_keyword_match(key, ["discount"])

    score += score_keyword_match(
        key,
        ["sales_amount", "amount", "revenue", "gross_profit", "quantity"],
        weight=2,
    )
    if is_identifier_field(field):
        score -= 8

    return score


def score_dimension_field(message: str, field: object) -> float:
    key = get_field_search_text(field)
    score = 0.0

    if "区域" in message or "地区" in message:
        score += score_keyword_match(key, ["region_name", "region", "province", "city"])
    if "渠道" in message:
        score += score_keyword_match(key, ["channel_name", "channel"])
    if "商品" in message or "产品" in message:
        score += score_keyword_match(key, ["product_name", "product", "sku"])
    if "分类" in message or "品类" in message:
        score += score_keyword_match(key, ["category", "sub_category"])
    if "品牌" in message:
        score += score_keyword_match(key, ["brand"])
    if "门店" in message or "店铺" in message:
        score += score_keyword_match(key, ["store_name", "store"])
    if "客户" in message or "会员" in message:
        score += score_keyword_match(key, ["customer_name", "customer_segment"])

    score += score_keyword_match(
        key,
        [
            "region_name",
            "channel_name",
            "category",
            "product_name",
            "brand",
            "store_name",
        ],
        weight=2,
    )
    if is_identifier_field(field) and not any(
        word in message.lower() for word in ["id", "编号", "编码"]
    ):
        score -= 20

    return score


def score_time_field(message: str, field: object) -> float:
    key = get_field_search_text(field)
    score = 0.0

    if any(word in message for word in ["最近", "趋势", "按月", "按日", "时间"]):
        score += score_keyword_match(key, ["order_date", "sale_date", "date", "time"])
    score += score_keyword_match(key, ["order_date", "sale_date", "date"], weight=2)

    return score


def score_keyword_match(key: str, keywords: list[str], weight: int = 4) -> float:
    return sum(weight for keyword in keywords if keyword in key)


def get_field_search_text(field: object) -> str:
    names = [
        getattr(field, "display_name", ""),
        getattr(field, "source_name", ""),
        getattr(field, "source_field", ""),
    ]
    return " ".join(str(name).lower() for name in names if name)


def is_identifier_field(field: object) -> bool:
    key = get_field_search_text(field)
    last_names = [name.rsplit(".", 1)[-1] for name in key.split()]
    return any(
        name == "id"
        or name.endswith("_id")
        or name.endswith("_no")
        or name.endswith("_code")
        or name in {"order_id", "customer_id", "product_id", "store_id", "channel_id"}
        for name in last_names
    )


def format_plan_fields(profile: object, field_ids: list[str]) -> list[dict[str, str]]:
    return [
        field
        for field_id in field_ids
        if (field := format_plan_field(profile, field_id)) is not None
    ]


def format_plan_field(profile: object, field_id: str | None) -> dict[str, str] | None:
    if not field_id:
        return None

    return {
        "fieldId": field_id,
        "displayName": get_profile_field_label(profile, field_id),
    }


def get_profile_field_label(profile: object, field_id: str) -> str:
    field = next((item for item in profile.fields if item.field_id == field_id), None)

    if not field:
        return field_id

    return field.display_name.rsplit(".", 1)[-1]


def get_profile_field_aggregation(profile: object, field_id: str) -> str:
    field = next((item for item in profile.fields if item.field_id == field_id), None)

    return field.aggregation or "sum" if field else "sum"


def summarize_query_result(result: dict[str, object]) -> str:
    if result.get("type") == "metric":
        return format_agent_value(result.get("value"))
    if result.get("type") == "trend":
        points = result.get("points") if isinstance(result.get("points"), list) else []
        return f"{len(points)} 个趋势点"
    if result.get("type") == "breakdown":
        items = result.get("items") if isinstance(result.get("items"), list) else []
        return f"{len(items)} 条拆解结果"
    rows = result.get("rows") if isinstance(result.get("rows"), list) else []
    return f"{len(rows)} 行明细"


def serialize_dataset_profile(profile: object) -> dict[str, object]:
    return {
        "datasetId": profile.dataset_id,
        "datasetName": profile.dataset_name,
        "datasourceId": profile.datasource_id,
        "sourceTables": profile.source_tables,
        "relationships": [item.model_dump() for item in profile.relationships],
        "fieldStats": {
            "measures": len(profile.measures),
            "dimensions": len(profile.dimensions),
            "timeFields": len(profile.time_fields),
            "total": len(profile.fields),
        },
        "fields": [
            {
                "fieldId": field.field_id,
                "displayName": field.display_name,
                "sourceName": field.source_name,
                "dataType": field.data_type,
                "semanticType": field.semantic_type,
                "aggregation": field.aggregation,
                "fieldKind": field.field_kind,
            }
            for field in profile.fields
        ],
    }


def build_query_artifact(
    dataset_name: str, result: dict[str, object]
) -> dict[str, object] | None:
    if result.get("type") == "table":
        return {
            "artifactId": f"art_{uuid.uuid4().hex}",
            "data": {
                "columns": result.get("columns") or [],
                "rows": result.get("rows") or [],
            },
            "kind": "table",
            "title": dataset_name,
        }

    return None


def compose_agent_answer(
    dataset_name: str,
    plan: dict[str, object],
    result: dict[str, object],
) -> str:
    if result.get("type") == "metric":
        return f"基于「{dataset_name}」查询，当前结果为 {format_agent_value(result.get('value'))}。"

    if result.get("type") == "trend":
        points = result.get("points") if isinstance(result.get("points"), list) else []
        if not points:
            return f"基于「{dataset_name}」查询，暂未返回趋势数据。"
        latest = points[-1]
        return (
            f"基于「{dataset_name}」查询，最近一个周期为 "
            f"{latest.get('x')}，数值 {format_agent_value(latest.get('y'))}。"
        )

    if result.get("type") == "breakdown":
        items = result.get("items") if isinstance(result.get("items"), list) else []
        if not items:
            return f"基于「{dataset_name}」查询，暂未返回拆解数据。"
        top = items[0]
        return (
            f"基于「{dataset_name}」查询，排名最高的是 {top.get('label')}，"
            f"数值 {format_agent_value(top.get('value'))}。"
        )

    return f"基于「{dataset_name}」查询，已返回明细表格。"


def compose_llm_agent_answer(state: AgentGraphState) -> str | None:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        return None

    content = chat_completion(
        config=llm_config,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是 BI 问数助手。只能基于给定查询结果回答，不能编造数据，"
                    "不能声称执行了额外查询。回答用中文，简洁自然。"
                    "禁止问候、寒暄、反问和营销式表达，不要使用“你好”“您好”“当然”等开场。"
                ),
            },
            {
                "role": "user",
                "content": (
                    "用户问题：\n"
                    f"{state['message']}\n\n"
                    "数据集名称：\n"
                    f"{state['profile'].dataset_name}\n\n"
                    "查询计划：\n"
                    f"{serialize_for_prompt(state['plan'])}\n\n"
                    "查询结果：\n"
                    f"{serialize_for_prompt(state['query_result'])}\n\n"
                    '请输出 JSON：{"answer":"最终回答"}'
                ),
            },
        ],
        temperature=0.3,
    )
    parsed = parse_json_object(content)

    if not parsed:
        return None

    answer = parsed.get("answer")

    return answer.strip() if isinstance(answer, str) and answer.strip() else None


def compose_streaming_agent_answer(
    state: AgentGraphState,
) -> tuple[str, list[dict[str, object]]]:
    llm_config = get_llm_config()

    if not llm_config.enabled:
        answer = compose_agent_answer(
            state["profile"].dataset_name, state["plan"], state["query_result"]
        )
        return answer, append_answer_events(state, answer)

    messages = [
        {
            "role": "system",
            "content": (
                "你是 BI 问数助手。只能基于给定查询结果回答，不能编造数据，"
                "不能声称执行了额外查询。回答用中文，简洁自然。直接输出最终回答文本。"
                "禁止问候、寒暄、反问和营销式表达，不要使用“你好”“您好”“当然”等开场。"
            ),
        },
        {
            "role": "user",
            "content": (
                "用户问题：\n"
                f"{state['message']}\n\n"
                "数据集名称：\n"
                f"{state['profile'].dataset_name}\n\n"
                "查询计划：\n"
                f"{serialize_for_prompt(state['plan'])}\n\n"
                "查询结果：\n"
                f"{serialize_for_prompt(state['query_result'])}"
            ),
        },
    ]
    events = list(state.get("events", []))
    chunks: list[str] = []

    for chunk in stream_chat_completion(
        config=llm_config, messages=messages, temperature=0.3
    ):
        chunks.append(chunk)
        events.append(create_event("answer.delta", {"text": chunk}))

    answer = "".join(chunks).strip()

    if not answer:
        answer = compose_agent_answer(
            state["profile"].dataset_name, state["plan"], state["query_result"]
        )
        return answer, append_answer_events(state, answer)

    events.append(create_event("answer.completed", {"text": answer}))

    return answer, events


def serialize_for_prompt(value: object) -> str:
    def fallback(item: object) -> str:
        if hasattr(item, "model_dump"):
            return str(item.model_dump())
        return str(item)

    import json

    return json.dumps(value, ensure_ascii=False, default=fallback)


def format_agent_value(value: object) -> str:
    if isinstance(value, int | float):
        return f"{value:,.2f}".rstrip("0").rstrip(".")

    return "" if value is None else str(value)


def append_answer_events(
    state: AgentGraphState, answer: str
) -> list[dict[str, object]]:
    events = list(state.get("events", []))

    for chunk in chunk_text(answer):
        events.append(create_event("answer.delta", {"text": chunk}))

    events.append(create_event("answer.completed", {"text": answer}))

    return events


def append_event(
    state: AgentGraphState,
    event_type: str,
    payload: dict[str, object],
) -> list[dict[str, object]]:
    events = list(state.get("events", []))
    events.append(create_event(event_type, payload))

    return events


def create_event(event_type: str, payload: dict[str, object]) -> dict[str, object]:
    event = {"payload": payload, "type": event_type}

    try:
        get_stream_writer()(event)
    except RuntimeError:
        pass

    return event


def chunk_text(text: str, size: int = 6) -> list[str]:
    return [text[index : index + size] for index in range(0, len(text), size)]
