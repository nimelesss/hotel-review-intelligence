"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { DistributionItem, SegmentId } from "@/entities/types";
import { formatPercent } from "@/shared/lib/format";

const COLORS = [
  "#0D5F73",
  "#3A7CA5",
  "#4C956C",
  "#C17E32",
  "#B05858",
  "#6B7280",
  "#8E8E8E",
  "#B7BDC8"
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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="share"
            nameKey="label"
            innerRadius={55}
            outerRadius={95}
            paddingAngle={3}
          >
            {filtered.map((entry, index) => (
              <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatPercent(value)}
            contentStyle={{
              borderRadius: "10px",
              border: "1px solid #d6deea"
            }}
          />
          <Legend formatter={(value: string) => value} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
