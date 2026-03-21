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

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            axisLine={{ stroke: "#d6deea" }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "#f7f9fc" }}
            contentStyle={{
              borderRadius: "10px",
              border: "1px solid #d6deea"
            }}
          />
          <Bar
            dataKey="score"
            fill={tone === "positive" ? "#1f8a5a" : "#b03838"}
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
