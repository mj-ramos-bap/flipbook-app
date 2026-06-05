"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export default function ViewsChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const safeData = data ?? [];
  if (safeData?.length === 0) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={safeData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd"
          label={{ value: "Date", position: "insideBottom", offset: -15, style: { textAnchor: "middle", fontSize: 11 } }} />
        <YAxis tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false}
          label={{ value: "Views", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fontSize: 11 } }} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Area type="monotone" dataKey="count" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.1} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
