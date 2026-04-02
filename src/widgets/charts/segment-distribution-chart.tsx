"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
  const filtered = data.filter((item) => item.count > 0);
  if (!filtered.length) {
    return <p className="text-sm text-textMuted">Нет данных для визуализации.</p>;
  }

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-[1.35rem] border border-border bg-[radial-gradient(circle_at_50%_28%,rgba(14,165,233,0.16),transparent_42%),radial-gradient(circle_at_78%_72%,rgba(236,72,153,0.12),transparent_30%)] px-2 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="share"
            nameKey="label"
            innerRadius={58}
            outerRadius={102}
            paddingAngle={4}
          >
            {filtered.map((entry, index) => (
              <Cell
                key={entry.id}
                fill={COLORS[index % COLORS.length]}
                stroke="rgba(15, 23, 42, 0.18)"
                strokeWidth={2}
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
          <Legend
            iconType="circle"
            wrapperStyle={{ paddingTop: "18px", fontSize: "13px" }}
            formatter={(value: string) => value}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
