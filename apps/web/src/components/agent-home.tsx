import { AgentChat } from "@/components/agent-chat";
import { AppShell } from "@/components/app-shell";
import { getJson } from "@/lib/server-api";

type Capability = {
  key: string;
  name: string;
  description: string;
};

type AgentHomeData = {
  capabilities: Capability[];
  prompts: string[];
};

type Datasource = {
  id: string;
  name: string;
  type: string;
  status: string;
  fields: number;
};

const fallback: AgentHomeData = {
  capabilities: [],
  prompts: [],
};

export async function AgentHomePage() {
  const data = await getJson<AgentHomeData>("/agent/capabilities", fallback);
  const datasourceData = await getJson<{ items: Datasource[] }>("/datasources", { items: [] });

  return (
    <AppShell
      active="agent"
      contentClassName="bg-[linear-gradient(115deg,#fff7fb_0%,#eef7ff_44%,#f7fbff_100%)]"
    >
      <AgentChat
        capabilities={data.capabilities}
        datasources={datasourceData.items}
        prompts={data.prompts}
      />
    </AppShell>
  );
}
