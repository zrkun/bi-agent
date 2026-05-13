CATALOG_NODE_TYPES = {
    "DashboardRoot",
    "SectionHeader",
    "MetricCard",
    "AreaChart",
    "LineChart",
    "MultiLineChart",
    "BarChart",
    "MultiBarChart",
    "PieChart",
    "RadarChart",
    "RadialChart",
    "DataTable",
    "DonutChart",
    "ProgressCard",
    "RankList",
}

WIDGET_TO_NODE_TYPE = {
    "metric": "MetricCard",
    "area": "AreaChart",
    "line": "LineChart",
    "multi_line": "MultiLineChart",
    "bar": "BarChart",
    "multi_bar": "MultiBarChart",
    "pie": "PieChart",
    "radar": "RadarChart",
    "radial": "RadialChart",
    "table": "DataTable",
    "donut": "DonutChart",
    "progress": "ProgressCard",
    "rank": "RankList",
}


def get_node_type_for_widget(widget_type: str) -> str:
    return WIDGET_TO_NODE_TYPE.get(widget_type, "DataTable")
