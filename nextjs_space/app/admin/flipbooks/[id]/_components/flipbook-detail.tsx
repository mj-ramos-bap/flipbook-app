"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Share2, BarChart3, Code2, Eye, Loader2, Lock, Globe, BookOpen, Printer, Download, Copy, Check, ExternalLink, Sparkles, Volume2 } from "lucide-react";
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
      await fetch(`/api/flipbooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
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
