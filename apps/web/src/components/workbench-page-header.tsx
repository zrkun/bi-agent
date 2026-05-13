import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HeaderStat = {
  label: string;
  value: string | number;
};

type WorkbenchPageHeaderProps = {
  action?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  stats?: HeaderStat[];
  title: string;
};

export function WorkbenchPageHeader({
  action,
  className,
  description,
  eyebrow,
  stats = [],
  title,
}: WorkbenchPageHeaderProps) {
  return (
    <section
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-4 rounded-[28px] border border-white/70 bg-white/42 px-6 py-5 shadow-[0_18px_60px_rgba(15,23,42,0.045)] backdrop-blur-sm",
        className,
      )}
    >
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          {eyebrow ? (
            <div className="text-[11px] font-medium tracking-[0.24em] text-[#8d96a3] uppercase">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] leading-none font-semibold text-[#111418]">{title}</h1>
            {stats.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {stats.map((stat) => (
                  <span
                    className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs text-[#5f6977]"
                    key={stat.label}
                  >
                    <span>{stat.label}</span>
                    <span className="font-semibold text-[#111418]">{stat.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {description ? <p className="text-sm text-[#6b7280]">{description}</p> : null}
        </div>
      </div>

      {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
    </section>
  );
}
