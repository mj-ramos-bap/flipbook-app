"use client";
import { useState, useEffect } from "react";
import { Eye, Users, Clock, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";

const ViewsChart = dynamic(() => import("./views-chart"), { ssr: false, loading: () => <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div> });
const PageViewsChart = dynamic(() => import("./page-views-chart"), { ssr: false, loading: () => <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div> });

export default function AnalyticsPanel({ flipbookId }: { flipbookId: string }) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [flipbookId]);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`/api/analytics/${flipbookId}`);
      const data = await res.json();
      setAnalytics(data ?? {});
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const a = document.createElement("a");
    a.href = `/api/analytics/export/${flipbookId}`;
    a.download = `analytics-${flipbookId}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[30vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  const statCards = [
    { label: "Total Views", value: analytics?.totalViews ?? 0, icon: Eye, color: "bg-indigo-100 text-indigo-600" },
    { label: "Unique Visitors", value: analytics?.uniqueVisitors ?? 0, icon: Users, color: "bg-purple-100 text-purple-600" },
    { label: "Avg. Duration (sec)", value: analytics?.avgDuration ?? 0, icon: Clock, color: "bg-emerald-100 text-emerald-600" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Analytics</h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <FileDown className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards?.map?.((stat: any, i: number) => {
          const Icon = stat?.icon;
          return (
            <Card key={i} className="border-0 shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat?.color ?? ""}`}>
                  {Icon && <Icon className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat?.label}</p>
                  <p className="text-xl font-bold font-display">{stat?.value ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          );
        }) ?? []}
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader><CardTitle className="text-base">Views Over Time (Last 30 Days)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ViewsChart data={analytics?.dailyViews ?? []} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader><CardTitle className="text-base">Page-Level Analytics</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <PageViewsChart data={analytics?.pageViews ?? []} />
          </div>
        </CardContent>
      </Card>

      {(analytics?.countryViews?.length ?? 0) > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-base">Geographic Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(analytics?.countryViews ?? []).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm font-medium">{c?.country ?? "Unknown"}</span>
                  <span className="text-sm text-muted-foreground">{c?.views ?? 0} views</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(analytics?.recentViews?.length ?? 0) > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-base">Recent Views</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Date</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Duration</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Location</th>
                </tr></thead>
                <tbody>
                  {(analytics?.recentViews ?? []).map((v: any) => (
                    <tr key={v?.id} className="border-b border-gray-50">
                      <td className="py-2 px-2 text-xs">{new Date(v?.createdAt ?? Date.now()).toLocaleString()}</td>
                      <td className="py-2 px-2 text-xs">{v?.duration ?? 0}s</td>
                      <td className="py-2 px-2 text-xs">{[v?.city, v?.country].filter(Boolean).join(", ") || "Unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
