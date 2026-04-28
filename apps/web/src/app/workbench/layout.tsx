"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { ComponentType, ReactNode } from "react";
import {
  BarChart3,
  Database,
  FileBarChart,
  LayoutDashboard,
  UsersRound,
  Waves,
} from "lucide-react";

const analysisItems = [
  { label: "仪表板", href: "/workbench/dashboards", icon: LayoutDashboard },
  { label: "数据大屏", href: "/workbench/screens", icon: FileBarChart },
];

const buildItems = [
  { label: "数据集", href: "/workbench/datasets", icon: BarChart3 },
  { label: "数据源", href: "/workbench/datasources", icon: Database },
];

const manageItems = [{ label: "成员与权限", href: "/workbench/members", icon: UsersRound }];

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell active="workbench" contentClassName="overflow-hidden bg-[#eef2f6]">
      <SidebarProvider className="h-full">
        <Sidebar className="w-64 bg-[#f8fafb]">
          <SidebarHeader className="px-6 pt-7 pb-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-[#0d1114] text-white">
                <Waves className="size-5" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold text-[#111418]">工作台</span>
                <span className="text-[11px] tracking-[0.28em] text-[#b4b6ba]">BI WORKBENCH</span>
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent className="px-6 pt-2">
            <WorkbenchSidebarGroup label="数据分析">
              {analysisItems.map((item) => (
                <SidebarItem
                  key={item.label}
                  icon={item.icon}
                  href={item.href}
                  label={item.label}
                  active={pathname.startsWith(item.href)}
                />
              ))}
            </WorkbenchSidebarGroup>
            <WorkbenchSidebarGroup label="数据构建">
              {buildItems.map((item) => (
                <SidebarItem
                  key={item.label}
                  icon={item.icon}
                  href={item.href}
                  label={item.label}
                  active={pathname.startsWith(item.href)}
                />
              ))}
            </WorkbenchSidebarGroup>
            <WorkbenchSidebarGroup label="平台管理">
              {manageItems.map((item) => (
                <SidebarItem
                  key={item.label}
                  icon={item.icon}
                  href={item.href}
                  label={item.label}
                  active={pathname.startsWith(item.href)}
                />
              ))}
            </WorkbenchSidebarGroup>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,#eaf5ff_0%,#f7fbff_24%,#f5f7fb_100%)]">
          <div className="min-h-full px-8 pt-8 pb-12">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AppShell>
  );
}

function WorkbenchSidebarGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <SidebarGroup className="pt-8 first:pt-0">
      <SidebarGroupLabel className="px-0 pb-4 text-[11px] tracking-[0.32em] text-[#a8abb0]">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-4">{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarItem({
  active = false,
  href = "#",
  icon: Icon,
  label,
}: {
  active?: boolean;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <SidebarMenuItem>
      <Link
        className={cn(
          "flex h-7 items-center justify-start gap-4 px-0 text-[15px] font-normal text-[#777b80] transition-colors hover:text-[#111418]",
          active && "text-[#111418]",
        )}
        href={href}
      >
        <Icon className="size-4 stroke-[1.7]" />
        <span>{label}</span>
      </Link>
    </SidebarMenuItem>
  );
}
