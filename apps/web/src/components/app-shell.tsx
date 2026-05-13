import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, Grid3X3, Search, Settings, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  contentClassName?: string;
};

export function AppShell({ children, contentClassName }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="z-20 shrink-0 bg-background/95 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex h-14 items-center px-5">
          <Link
            href="/agent"
            className="mr-10 flex items-center text-2xl font-semibold tracking-tight"
          >
            <span>Quick</span>
            <span className="ml-1 text-primary">BI</span>
          </Link>
          <div className="flex flex-1" />
          <div className="ml-10 flex items-center gap-1">
            {[Search, Grid3X3, Bell, Settings].map((Icon) => (
              <Button
                key={Icon.displayName ?? Icon.name}
                size="icon"
                variant="ghost"
                aria-label={Icon.name}
              >
                <Icon />
              </Button>
            ))}
            <Button size="icon" variant="secondary" aria-label="user">
              <UserRound />
            </Button>
          </div>
        </div>
      </header>
      <main className={cn("min-h-0 flex-1 overflow-y-auto", contentClassName)}>{children}</main>
    </div>
  );
}
