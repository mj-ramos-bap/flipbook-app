"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Eye, Users, Clock, Plus, Settings, Share2, Trash2, Copy, ExternalLink, Loader2, LayoutGrid, List, Upload, RefreshCw, FileText, X, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
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

  // ── Replace PDF modal state ──────────────────────────────────────
  const [replaceTarget, setReplaceTarget] = useState<FlipbookItem | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceDragOver, setReplaceDragOver] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState<"idle" | "uploading" | "processing" | "rendering" | "done" | "error">("idle");
  const [replaceRenderProgress, setReplaceRenderProgress] = useState<{ page: number; total: number } | null>(null);
  const [replaceError, setReplaceError] = useState("");

  useEffect(() => { fetchData(); }, []);

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
      setFlipbooks((prev) => prev?.filter?.((f) => f?.id !== id) ?? []);
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

  const openReplaceModal = (fb: FlipbookItem) => {
    setReplaceTarget(fb);
    setReplaceFile(null);
    setReplaceStatus("idle");
    setReplaceError("");
    setReplaceRenderProgress(null);
  };

  const closeReplaceModal = () => {
    if (replaceStatus === "uploading" || replaceStatus === "processing" || replaceStatus === "rendering") return;
    setReplaceTarget(null);
    setReplaceFile(null);
    setReplaceStatus("idle");
    setReplaceError("");
    setReplaceRenderProgress(null);
  };

  const handleReplace = useCallback(async () => {
    if (!replaceFile || !replaceTarget) return;
    setReplaceStatus("uploading");
    setReplaceError("");
    setReplaceRenderProgress(null);

    try {
      // 1. Upload new PDF to GCS
      const uploadRes = await fetch("/api/upload/direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(replaceFile.size),
          "x-file-name": encodeURIComponent(replaceFile.name ?? "upload.pdf"),
        },
        body: replaceFile,
      });
      if (!uploadRes.ok) throw new Error("PDF upload failed");
      const { cloud_storage_path } = (await uploadRes.json()) ?? {};

      setReplaceStatus("processing");

      // 2. Generate new thumbnail + page count via pdfjs
      let newPageCount = 0;
      let newThumbnailPath: string | null = null;
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;
        const buf = await replaceFile.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        newPageCount = doc.numPages ?? 0;

        const page = await doc.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const sc = Math.min(480 / vp.width, 360 / vp.height);
        const sv = page.getViewport({ scale: sc });
        const c = document.createElement("canvas");
        c.width = Math.round(sv.width); c.height = Math.round(sv.height);
        await page.render({ canvasContext: c.getContext("2d")!, viewport: sv }).promise;
        const blob = await new Promise<Blob>((resolve, reject) =>
          c.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.85)
        );
        const thumbRes = await fetch("/api/upload/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "image/jpeg", "Content-Length": String(blob.size) },
          body: blob,
        });
        if (thumbRes.ok) newThumbnailPath = ((await thumbRes.json()) ?? {}).cloud_storage_path ?? null;
      } catch {}

      // 3. Patch flipbook — uuid/id unchanged, new cloudStoragePath
      await fetch(`/api/flipbooks/${replaceTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloudStoragePath: cloud_storage_path,
          renderStatus: "pending",
          renderedPageCount: 0,
          ...(newPageCount > 0 && { pageCount: newPageCount }),
          ...(newThumbnailPath && { thumbnailPath: newThumbnailPath, thumbnailIsPublic: false }),
        }),
      });

      // 4. Re-render pages (SSE stream)
      setReplaceStatus("rendering");
      try {
        const renderRes = await fetch(`/api/flipbooks/${replaceTarget.id}/render`, { method: "POST" });
        const reader = renderRes.body?.getReader();
        if (reader) {
          const dec = new TextDecoder();
          let buf2 = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf2 += dec.decode(value, { stream: true });
            const lines = buf2.split("\n");
            buf2 = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const ev = JSON.parse(line.slice(6));
                if (ev.status === "progress") setReplaceRenderProgress({ page: ev.page, total: ev.total });
              } catch {}
            }
          }
        }
      } catch {}

      setReplaceStatus("done");
      // Update card in list with new page count
      if (newPageCount > 0) {
        setFlipbooks((prev) => prev.map((f) =>
          f.id === replaceTarget.id ? { ...f, pageCount: newPageCount } : f
        ));
      }
      toast.success("PDF replaced — all embed codes unchanged");
    } catch (e: any) {
      setReplaceError(e?.message ?? "Replace failed");
      setReplaceStatus("error");
      toast.error("Failed to replace PDF");
    }
  }, [replaceFile, replaceTarget]);

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

  const isBusy = replaceStatus === "uploading" || replaceStatus === "processing" || replaceStatus === "rendering";

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
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => copyLink(fb?.uuid ?? "")}>
                        <Copy className="w-3 h-3 mr-1" /> Link
                      </Button>
                      <Link href={`/view/${fb?.uuid ?? ""}`} target="_blank">
                        <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-1" /> View</Button>
                      </Link>
                      <Button variant="outline" size="sm" onClick={() => openReplaceModal(fb)} title="Replace PDF">
                        <Upload className="w-3 h-3 mr-1" /> Replace
                      </Button>
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
                  <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100">
                    {fb?.thumbnailUrl ? (
                      <Image src={fb.thumbnailUrl} alt={fb?.title ?? "Flipbook"} fill className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <BookOpen className="w-7 h-7 text-indigo-300" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{fb?.title ?? "Untitled"}</h4>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{fb?.pageCount ?? 0} pages</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{fb?._count?.views ?? 0} views</span>
                      <span className="text-xs text-muted-foreground">{new Date(fb?.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <span className={`hidden sm:inline-flex px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    fb?.status === "ready" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>{fb?.status === "ready" ? "Published" : "Processing"}</span>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copyLink(fb?.uuid ?? "")}>
                      <Copy className="w-3 h-3 mr-1" /> Link
                    </Button>
                    <Link href={`/view/${fb?.uuid ?? ""}`} target="_blank">
                      <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-1" /> View</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => openReplaceModal(fb)} title="Replace PDF">
                      <Upload className="w-3 h-3 mr-1" /> Replace
                    </Button>
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

      {/* ── Replace PDF modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {replaceTarget && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeReplaceModal} />

            {/* Dialog */}
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-indigo-600" /> Replace PDF
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-[280px]">{replaceTarget.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">All embed codes stay unchanged after replacing.</p>
                </div>
                <button onClick={closeReplaceModal} disabled={isBusy} className="text-muted-foreground hover:text-foreground disabled:opacity-40 mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  isBusy
                    ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                    : replaceDragOver
                    ? "border-indigo-400 bg-indigo-50 cursor-copy"
                    : replaceFile
                    ? "border-green-400 bg-green-50 cursor-pointer"
                    : "border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer"
                }`}
                onDragOver={(e: any) => { if (isBusy) return; e?.preventDefault?.(); setReplaceDragOver(true); }}
                onDragLeave={() => setReplaceDragOver(false)}
                onDrop={(e: any) => {
                  e?.preventDefault?.();
                  setReplaceDragOver(false);
                  if (isBusy) return;
                  const f = e?.dataTransfer?.files?.[0];
                  if (f?.type === "application/pdf") { setReplaceFile(f); setReplaceStatus("idle"); setReplaceError(""); }
                  else setReplaceError("Please select a PDF file");
                }}
                onClick={() => { if (!isBusy) replaceFileRef?.current?.click?.(); }}
              >
                <input
                  ref={replaceFileRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e: any) => {
                    const f = e?.target?.files?.[0];
                    if (f) { setReplaceFile(f); setReplaceStatus("idle"); setReplaceError(""); }
                  }}
                />
                {replaceFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="font-medium text-green-800 text-sm truncate">{replaceFile.name}</p>
                      <p className="text-xs text-green-600">{((replaceFile.size ?? 0) / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                    {!isBusy && (
                      <button className="ml-2 text-gray-400 hover:text-gray-600"
                        onClick={(e: any) => { e?.stopPropagation?.(); setReplaceFile(null); setReplaceStatus("idle"); }}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-medium">Drag & drop new PDF here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
                  </div>
                )}
              </div>

              {/* Error */}
              {replaceError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {replaceError}
                </div>
              )}

              {/* Progress */}
              {(replaceStatus === "uploading" || replaceStatus === "processing") && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  {replaceStatus === "uploading" ? "Uploading PDF to server..." : "Generating thumbnail..."}
                </div>
              )}
              {replaceStatus === "rendering" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      {replaceRenderProgress
                        ? `Rendering page ${replaceRenderProgress.page} of ${replaceRenderProgress.total}`
                        : "Preparing pages..."}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {replaceRenderProgress ? `${Math.round((replaceRenderProgress.page / replaceRenderProgress.total) * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                      style={{
                        width: replaceRenderProgress
                          ? `${Math.round((replaceRenderProgress.page / replaceRenderProgress.total) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
              {replaceStatus === "done" && (
                <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" /> PDF replaced — all embed codes still work.
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeReplaceModal} disabled={isBusy}>
                  {replaceStatus === "done" ? "Close" : "Cancel"}
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  onClick={handleReplace}
                  disabled={!replaceFile || isBusy || replaceStatus === "done"}
                >
                  {isBusy
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{replaceStatus === "uploading" ? "Uploading..." : replaceStatus === "processing" ? "Processing..." : "Rendering..."}</>
                    : <><Upload className="w-4 h-4 mr-2" />Upload & Replace</>}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
