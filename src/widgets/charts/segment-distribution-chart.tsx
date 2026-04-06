"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DistributionItem, SegmentId } from "@/entities/types";
import { formatPercent } from "@/shared/lib/format";

const COLORS = [
  "#0EA5E9",
  "#2563EB",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EC4899",
  "#8B5CF6"
];

export function SegmentDistributionChart({
  data
}: {
  data: DistributionItem<SegmentId>[];
}) {
  const [isNarrowMobile, setIsNarrowMobile] = useState(false);
  const filtered = data.filter((item) => item.count > 0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 420px)");
    const sync = () => setIsNarrowMobile(mediaQuery.matches);

    sync();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, []);

  if (!filtered.length) {
    return <p className="text-sm text-textMuted">Нет данных для визуализации.</p>;
  }

  return (
    <div className="segment-chart-shell relative w-full rounded-[1.35rem] border border-border bg-[radial-gradient(circle_at_50%_28%,rgba(14,165,233,0.16),transparent_42%),radial-gradient(circle_at_78%_72%,rgba(236,72,153,0.12),transparent_30%)] px-3 pb-4 pt-3 sm:px-2">
      <div className="h-[18.5rem] w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={filtered}
              dataKey="share"
              nameKey="label"
              cx="50%"
              cy={isNarrowMobile ? "46%" : "45%"}
              innerRadius={isNarrowMobile ? "42%" : "38%"}
              outerRadius={isNarrowMobile ? "72%" : "68%"}
              paddingAngle={isNarrowMobile ? 3 : 4}
              isAnimationActive={!isNarrowMobile}
              animationBegin={140}
              animationDuration={920}
              animationEasing="ease-out"
            >
              {filtered.map((entry, index) => (
                <Cell
                  key={entry.id}
                  fill={COLORS[index % COLORS.length]}
                  stroke="rgba(248, 250, 252, 0.92)"
                  strokeWidth={isNarrowMobile ? 1.5 : 2}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatPercent(value)}
              contentStyle={{
                borderRadius: "16px",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: "rgba(15, 23, 42, 0.92)",
                color: "#f8fafc",
                boxShadow: "0 20px 40px rgba(15, 23, 42, 0.18)"
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 px-1 text-sm leading-6 text-text sm:mt-4 sm:gap-x-5">
        {filtered.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
