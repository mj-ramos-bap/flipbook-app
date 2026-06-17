"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Eye, Users, Clock, Plus, Settings, BarChart3, Share2, Trash2, Copy, ExternalLink, Loader2, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface FlipbookItem {
  id: string;
  uuid: string;
  title: string;
  description: string | null;
  pageCount: number;
  status: string;
  createdAt: string;
  thumbnailUrl: string | null;
  _count: { views: number };
}

export default function DashboardContent() {
  const [flipbooks, setFlipbooks] = useState<FlipbookItem[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [fbRes, statsRes] = await Promise.all([
        fetch("/api/flipbooks"),
        fetch("/api/analytics/overview"),
      ]);
      const fbData = await fbRes.json();
      const statsData = await statsRes.json();
      setFlipbooks(fbData?.flipbooks ?? []);
      setStats(statsData ?? {});
    } catch (e: any) {
      console.error("Failed to load dashboard", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this flipbook?")) return;
    try {
      const res = await fetch(`/api/flipbooks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setFlipbooks((prev) => (prev ?? [])?.filter?.((f: FlipbookItem) => f?.id !== id) ?? []);
      toast.success("Flipbook deleted");
    } catch (e: any) {
      console.error("Delete error", e);
      toast.error("Failed to delete flipbook");
    }
  };

  const copyLink = (uuid: string) => {
    const url = `${window?.location?.origin ?? ""}/view/${uuid}`;
    navigator?.clipboard?.writeText?.(url);
    toast.success("Link copied to clipboard");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Flipbooks", value: stats?.totalFlipbooks ?? 0, icon: BookOpen, color: "bg-indigo-100 text-indigo-600" },
    { label: "Total Views", value: stats?.totalViews ?? 0, icon: Eye, color: "bg-purple-100 text-purple-600" },
    { label: "Unique Visitors", value: stats?.uniqueVisitors ?? 0, icon: Users, color: "bg-emerald-100 text-emerald-600" },
    { label: "Avg. Time (sec)", value: stats?.avgDuration ?? 0, icon: Clock, color: "bg-amber-100 text-amber-600" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Manage and monitor your flipbooks</p>
        </div>
        <Link href="/admin/upload">
          <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
            <Plus className="w-4 h-4 mr-2" /> Upload PDF
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards?.map?.((stat: any, i: number) => {
          const Icon = stat?.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className="border-0 shadow-md">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat?.color ?? ""}`}>
                    {Icon && <Icon className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{stat?.label}</p>
                    <p className="text-2xl font-bold font-display">{stat?.value ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        }) ?? []}
      </div>

      {/* Flipbooks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Your Flipbooks</h3>
          {(flipbooks?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {(flipbooks?.length ?? 0) === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-12 text-center">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No flipbooks yet. Upload your first PDF to get started.</p>
              <Link href="/admin/upload" className="mt-4 inline-block">
                <Button variant="outline"><Plus className="w-4 h-4 mr-2" /> Upload PDF</Button>
              </Link>
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {flipbooks?.map?.((fb: FlipbookItem, i: number) => (
              <motion.div key={fb?.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden group">
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-indigo-100 to-purple-100">
                    {fb?.thumbnailUrl ? (
                      <Image src={fb.thumbnailUrl} alt={fb?.title ?? "Flipbook"} fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BookOpen className="w-16 h-16 text-indigo-300" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        fb?.status === "ready" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>{fb?.status === "ready" ? "Published" : "Processing"}</span>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-base truncate">{fb?.title ?? "Untitled"}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{fb?.pageCount ?? 0} pages · {fb?._count?.views ?? 0} views</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => copyLink(fb?.uuid ?? "")}>
                        <Copy className="w-3 h-3 mr-1" /> Link
                      </Button>
                      <Link href={`/view/${fb?.uuid ?? ""}`} target="_blank">
                        <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-1" /> View</Button>
                      </Link>
                      <Link href={`/admin/flipbooks/${fb?.id}`}>
                        <Button variant="outline" size="sm"><Settings className="w-3 h-3" /></Button>
                      </Link>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(fb?.id ?? "")} className="text-red-500 hover:text-red-700 ml-auto">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )) ?? []}
          </div>
        ) : (
          <Card className="border-0 shadow-md overflow-hidden">
            <div className="divide-y">
              {flipbooks?.map?.((fb: FlipbookItem, i: number) => (
                <motion.div key={fb?.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100">
                    {fb?.thumbnailUrl ? (
                      <Image src={fb.thumbnailUrl} alt={fb?.title ?? "Flipbook"} fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BookOpen className="w-7 h-7 text-indigo-300" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{fb?.title ?? "Untitled"}</h4>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{fb?.pageCount ?? 0} pages</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{fb?._count?.views ?? 0} views</span>
                      <span className="text-xs text-muted-foreground">{new Date(fb?.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Status */}
                  <span className={`hidden sm:inline-flex px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    fb?.status === "ready" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>{fb?.status === "ready" ? "Published" : "Processing"}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copyLink(fb?.uuid ?? "")}>
                      <Copy className="w-3 h-3 mr-1" /> Link
                    </Button>
                    <Link href={`/view/${fb?.uuid ?? ""}`} target="_blank">
                      <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-1" /> View</Button>
                    </Link>
                    <Link href={`/admin/flipbooks/${fb?.id}`}>
                      <Button variant="outline" size="sm"><Settings className="w-3 h-3 mr-1" /> Settings</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(fb?.id ?? "")} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </motion.div>
              )) ?? []}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
