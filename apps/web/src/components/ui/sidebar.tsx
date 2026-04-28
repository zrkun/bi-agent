"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function SidebarProvider({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-h-0 w-full", className)} data-slot="sidebar-wrapper" {...props}>
      {children}
    </div>
  );
}

function Sidebar({ children, className, ...props }: ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
      data-slot="sidebar"
      {...props}
    >
      {children}
    </aside>
  );
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-3", className)} data-slot="sidebar-header" {...props} />;
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto px-2 py-2", className)}
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-3", className)} data-slot="sidebar-footer" {...props} />;
}

function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("py-2", className)} data-slot="sidebar-group" {...props} />;
}

function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      data-slot="sidebar-group-label"
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-1", className)} data-slot="sidebar-group-content" {...props} />
  );
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("grid gap-1", className)} data-slot="sidebar-menu" {...props} />;
}

function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("list-none", className)} data-slot="sidebar-menu-item" {...props} />;
}

function SidebarMenuButton({
  className,
  isActive = false,
  ...props
}: ComponentProps<"button"> & {
  isActive?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        className,
      )}
      data-active={isActive}
      data-slot="sidebar-menu-button"
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0 flex-1", className)} data-slot="sidebar-inset" {...props} />
  );
}

function SidebarRail({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("w-px shrink-0 bg-border", className)} data-slot="sidebar-rail" {...props} />
  );
}

function SidebarSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("my-2 h-px bg-sidebar-border", className)}
      data-slot="sidebar-separator"
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
};
