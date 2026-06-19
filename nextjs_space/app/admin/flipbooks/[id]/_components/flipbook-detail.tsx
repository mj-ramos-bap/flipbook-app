"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Share2, BarChart3, Code2, Eye, Loader2, Lock, Globe, BookOpen, Printer, Download, Copy, Check, ExternalLink, Sparkles, Volume2, Upload, RefreshCw, FileText, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { toast } from "sonner";
import AnalyticsPanel from "./analytics-panel";
import EmbedPanel from "./embed-panel";

interface FlipbookData {
  id: string;
  uuid: string;
  title: string;
  description: string | null;
  pageCount: number;
  status: string;
  passwordProtected: boolean;
  password: string | null;
  domainRestriction: boolean;
  allowedDomains: string | null;
  pagesPerView: string;
  enableShare: boolean;
  enablePrint: boolean;
  enableDownload: boolean;
  enableAnimatedFlip: boolean;
  enablePageSound: boolean;
  pdfUrl: string | null;
  thumbnailUrl: string | null;
  shareToken: string | null;
  _count: { views: number };
}

export default function FlipbookDetail({ id }: { id: string }) {
  const router = useRouter();
  const [flipbook, setFlipbook] = useState<FlipbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<any>({});

  // ── Replace PDF state ────────────────────────────────────────────
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceDragOver, setReplaceDragOver] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState<"idle" | "uploading" | "processing" | "rendering" | "done" | "error">("idle");
  const [replaceRenderProgress, setReplaceRenderProgress] = useState<{ page: number; total: number } | null>(null);
  const [replaceError, setReplaceError] = useState("");

  useEffect(() => {
    fetchFlipbook();
  }, [id]);

  const fetchFlipbook = async () => {
    try {
      const res = await fetch(`/api/flipbooks/${id}`);
      const data = (await res.json()) ?? {};
      setFlipbook(data?.flipbook ?? null);
      setForm({
        title: data?.flipbook?.title ?? "",
        description: data?.flipbook?.description ?? "",
        passwordProtected: data?.flipbook?.passwordProtected ?? false,
        password: data?.flipbook?.password ?? "",
        domainRestriction: data?.flipbook?.domainRestriction ?? false,
        allowedDomains: data?.flipbook?.allowedDomains ?? "",
        pagesPerView: data?.flipbook?.pagesPerView ?? "double",
        enableShare: data?.flipbook?.enableShare ?? true,
        enablePrint: data?.flipbook?.enablePrint ?? false,
        enableDownload: data?.flipbook?.enableDownload ?? false,
        enableAnimatedFlip: data?.flipbook?.enableAnimatedFlip ?? true,
        enablePageSound: data?.flipbook?.enablePageSound ?? true,
      });
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/flipbooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Changes saved successfully");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleReplace = useCallback(async () => {
    if (!replaceFile) return;
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

      // 2. Generate new thumbnail + page count via pdfjs in the browser
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

      // 3. Patch flipbook — same uuid/id, new cloudStoragePath + reset render state
      await fetch(`/api/flipbooks/${id}`, {
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

      // 4. Re-render all pages server-side (streams progress via SSE)
      setReplaceStatus("rendering");
      try {
        const renderRes = await fetch(`/api/flipbooks/${id}/render`, { method: "POST" });
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
      setReplaceFile(null);
      toast.success("PDF replaced — all embed codes remain unchanged");
      // Refresh flipbook data to show updated page count
      fetchFlipbook();
    } catch (e: any) {
      setReplaceError(e?.message ?? "Replace failed");
      setReplaceStatus("error");
      toast.error("Failed to replace PDF");
    }
  }, [replaceFile, id]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  if (!flipbook) {
    return <div className="text-center py-12 text-muted-foreground">Flipbook not found</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">{flipbook?.title ?? "Untitled"}</h2>
          <p className="text-muted-foreground text-sm">{flipbook?.pageCount ?? 0} pages · {flipbook?._count?.views ?? 0} views</p>
        </div>
        <a href={`/view/${flipbook?.uuid ?? ""}${flipbook?.shareToken ? `?t=${flipbook.shareToken}` : ""}`} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-2" /> Preview</Button>
        </a>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="embed">Share & Embed</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Basic Info */}
            <Card className="border-0 shadow-md">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" /> Basic Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Title</label>
                  <Input value={form?.title ?? ""} onChange={(e: any) => setForm({ ...(form ?? {}), title: e?.target?.value ?? "" })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Description</label>
                  <Input value={form?.description ?? ""} onChange={(e: any) => setForm({ ...(form ?? {}), description: e?.target?.value ?? "" })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Pages Per View</label>
                  <div className="flex gap-2">
                    {["single", "double"].map((v: string) => (
                      <Button key={v} variant={form?.pagesPerView === v ? "default" : "outline"} size="sm"
                        onClick={() => setForm({ ...(form ?? {}), pagesPerView: v })}
                        className={form?.pagesPerView === v ? "bg-indigo-600" : ""}>
                        {v === "single" ? "Single Page" : "Double Page Spread"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card className="border-0 shadow-md">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4" /> Security</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Password Protection</p>
                    <p className="text-xs text-muted-foreground">Require a password to view this flipbook</p>
                  </div>
                  <Switch checked={form?.passwordProtected ?? false} onCheckedChange={(v: boolean) => setForm({ ...(form ?? {}), passwordProtected: v })} />
                </div>
                {form?.passwordProtected && (
                  <Input type="password" placeholder="Set password" value={form?.password ?? ""}
                    onChange={(e: any) => setForm({ ...(form ?? {}), password: e?.target?.value ?? "" })} />
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Domain Restriction</p>
                    <p className="text-xs text-muted-foreground">Only allow embedding from specific domains</p>
                  </div>
                  <Switch checked={form?.domainRestriction ?? false} onCheckedChange={(v: boolean) => setForm({ ...(form ?? {}), domainRestriction: v })} />
                </div>
                {form?.domainRestriction && (
                  <Input placeholder="example.com, learning.edu" value={form?.allowedDomains ?? ""}
                    onChange={(e: any) => setForm({ ...(form ?? {}), allowedDomains: e?.target?.value ?? "" })} />
                )}
              </CardContent>
            </Card>

            {/* Feature Toggles */}
            <Card className="border-0 shadow-md">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> Feature Controls</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "enableAnimatedFlip", label: "Animated Page Turning", desc: "Realistic 3D page flip animation when turning pages", icon: Sparkles },
                  { key: "enablePageSound", label: "Page Turn Sound", desc: "Play a sound effect when pages are turned (viewers can mute)", icon: Volume2 },
                  { key: "enableShare", label: "Share Button", desc: "Allow viewers to share the flipbook link", icon: Share2 },
                  { key: "enablePrint", label: "Print Button", desc: "Allow viewers to print pages", icon: Printer },
                  { key: "enableDownload", label: "Download Button", desc: "Allow viewers to download the PDF", icon: Download },
                ].map((toggle: any) => {
                  const Icon = toggle?.icon;
                  return (
                    <div key={toggle?.key} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
                        <div>
                          <p className="font-medium text-sm">{toggle?.label}</p>
                          <p className="text-xs text-muted-foreground">{toggle?.desc}</p>
                        </div>
                      </div>
                      <Switch checked={form?.[toggle?.key] ?? false}
                        onCheckedChange={(v: boolean) => setForm({ ...(form ?? {}), [toggle?.key ?? ""]: v })} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Replace PDF */}
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Replace PDF
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload a new PDF version. All embed codes and share links stay unchanged — they always point to the latest version.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Drop zone */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    replaceDragOver
                      ? "border-indigo-400 bg-indigo-50"
                      : replaceFile
                      ? "border-green-400 bg-green-50"
                      : "border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/50"
                  }`}
                  onDragOver={(e: any) => { e?.preventDefault?.(); setReplaceDragOver(true); }}
                  onDragLeave={() => setReplaceDragOver(false)}
                  onDrop={(e: any) => {
                    e?.preventDefault?.();
                    setReplaceDragOver(false);
                    const f = e?.dataTransfer?.files?.[0];
                    if (f?.type === "application/pdf") { setReplaceFile(f); setReplaceStatus("idle"); setReplaceError(""); }
                    else setReplaceError("Please select a PDF file");
                  }}
                  onClick={() => replaceFileRef?.current?.click?.()}
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
                      <FileText className="w-8 h-8 text-green-600" />
                      <div className="text-left">
                        <p className="font-medium text-green-800 text-sm">{replaceFile.name}</p>
                        <p className="text-xs text-green-600">{((replaceFile.size ?? 0) / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                      <Button variant="ghost" size="icon" className="ml-2"
                        onClick={(e: any) => { e?.stopPropagation?.(); setReplaceFile(null); setReplaceStatus("idle"); }}>
                        <X className="w-4 h-4" />
                      </Button>
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
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {replaceStatus === "uploading" ? "Uploading PDF..." : "Generating thumbnail..."}
                  </div>
                )}
                {replaceStatus === "rendering" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {replaceRenderProgress
                          ? `Re-rendering pages: ${replaceRenderProgress.page} / ${replaceRenderProgress.total}`
                          : "Preparing pages..."}
                      </span>
                      <span className="text-muted-foreground">
                        {replaceRenderProgress
                          ? `${Math.round((replaceRenderProgress.page / replaceRenderProgress.total) * 100)}%`
                          : "0%"}
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
                    <Check className="w-4 h-4" /> PDF replaced successfully — all embed codes unchanged.
                  </div>
                )}

                <Button
                  onClick={handleReplace}
                  disabled={!replaceFile || replaceStatus === "uploading" || replaceStatus === "processing" || replaceStatus === "rendering"}
                  variant="outline"
                  className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  {(replaceStatus === "uploading" || replaceStatus === "processing" || replaceStatus === "rendering")
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <RefreshCw className="w-4 h-4 mr-2" />}
                  {replaceStatus === "uploading" ? "Uploading..." : replaceStatus === "processing" ? "Processing..." : replaceStatus === "rendering" ? "Re-rendering..." : "Upload & Replace"}
                </Button>
              </CardContent>
            </Card>

            <Button onClick={handleSave} disabled={saving}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700" size="lg">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : saved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </Button>
          </motion.div>
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsPanel flipbookId={id} />
        </TabsContent>

        <TabsContent value="embed">
          <EmbedPanel uuid={flipbook?.uuid ?? ""} title={flipbook?.title ?? "Flipbook"} shareToken={flipbook?.shareToken ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
