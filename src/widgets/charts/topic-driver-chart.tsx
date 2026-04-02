"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DriverItem } from "@/entities/types";

export function TopicDriverChart({
  data,
  tone
}: {
  data: DriverItem[];
  tone: "positive" | "negative";
}) {
  if (!data.length) {
    return <p className="text-sm text-textMuted">Драйверы пока не обнаружены.</p>;
  }

  const barColor = tone === "positive" ? "#22C55E" : "#EF4444";
  const hoverColor = tone === "positive" ? "rgba(34, 197, 94, 0.16)" : "rgba(239, 68, 68, 0.16)";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-soft)" }}
            axisLine={{ stroke: "var(--border-strong)" }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-soft)" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: hoverColor }}
            labelStyle={{ color: "var(--text-soft)", marginBottom: "6px" }}
            itemStyle={{ color: "var(--text)" }}
            contentStyle={{
              borderRadius: "14px",
              border: "1px solid var(--border-strong)",
              backgroundColor: "var(--panel-solid)",
              color: "var(--text)",
              boxShadow: "0 18px 48px rgba(2, 8, 23, 0.18)"
            }}
          />
          <Bar
            dataKey="score"
            fill={barColor}
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
