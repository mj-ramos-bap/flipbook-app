"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

export default function PageViewsChart({ data }: { data: Array<{ pageNumber: number; views: number; avgDuration: number }> }) {
  const safeData = data ?? [];
  if (safeData?.length === 0) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <XAxis dataKey="pageNumber" tickLine={false} tick={{ fontSize: 10 }}
          label={{ value: "Page", position: "insideBottom", offset: -15, style: { textAnchor: "middle", fontSize: 11 } }} />
        <YAxis tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false}
          label={{ value: "Views", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fontSize: 11 } }} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Bar dataKey="views" fill="#7C3AED" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
