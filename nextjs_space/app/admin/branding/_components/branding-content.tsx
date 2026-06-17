"use client";
import { useState, useEffect, useRef } from "react";
import { Palette, Upload, Save, Loader2, Check, Type, Image as ImageIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import Image from "next/image";

export default function BrandingContent() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchBranding();
  }, []);

  const fetchBranding = async () => {
    try {
      const res = await fetch("/api/branding");
      const data = (await res.json()) ?? {};
      setBranding(data?.branding ?? {});
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await fetch("/api/upload/logo", {
        method: "POST",
        headers: { "Content-Type": file.type ?? "image/png" },
        body: file,
      });
      const data = (await res.json()) ?? {};
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      setBranding((prev: any) => ({ ...(prev ?? {}), logoPath: data.cloud_storage_path, logoIsPublic: false }));
    } catch (e: any) {
      console.error("Logo upload error:", e);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColor: branding?.primaryColor ?? "#4F46E5",
          secondaryColor: branding?.secondaryColor ?? "#7C3AED",
          loadingText: branding?.loadingText ?? "Loading your flipbook...",
          logoPath: branding?.logoPath ?? null,
          logoIsPublic: branding?.logoIsPublic ?? true,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      console.error(e);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Branding Settings</h2>
        <p className="text-muted-foreground mt-1">Customize how your flipbooks appear to viewers</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Logo */}
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Company Logo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              {branding?.logoUrl ? (
                <div className="relative w-20 h-20 rounded-xl bg-gray-100 overflow-hidden">
                  <Image src={branding.logoUrl} alt="Company logo" fill className="object-contain p-2" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                </div>
              )}
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" onClick={() => fileRef?.current?.click?.()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload Logo
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG or SVG, max 2MB</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Color Scheme</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={branding?.primaryColor ?? "#4F46E5"}
                    onChange={(e: any) => setBranding((p: any) => ({ ...(p ?? {}), primaryColor: e?.target?.value ?? "#4F46E5" }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                  <Input value={branding?.primaryColor ?? "#4F46E5"}
                    onChange={(e: any) => setBranding((p: any) => ({ ...(p ?? {}), primaryColor: e?.target?.value ?? "#4F46E5" }))}
                    className="font-mono text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={branding?.secondaryColor ?? "#7C3AED"}
                    onChange={(e: any) => setBranding((p: any) => ({ ...(p ?? {}), secondaryColor: e?.target?.value ?? "#7C3AED" }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                  <Input value={branding?.secondaryColor ?? "#7C3AED"}
                    onChange={(e: any) => setBranding((p: any) => ({ ...(p ?? {}), secondaryColor: e?.target?.value ?? "#7C3AED" }))}
                    className="font-mono text-sm" />
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="flex gap-3 mt-2">
              <div className="h-12 flex-1 rounded-lg" style={{ background: branding?.primaryColor ?? "#4F46E5" }} />
              <div className="h-12 flex-1 rounded-lg" style={{ background: branding?.secondaryColor ?? "#7C3AED" }} />
              <div className="h-12 flex-1 rounded-lg" style={{ background: `linear-gradient(135deg, ${branding?.primaryColor ?? "#4F46E5"}, ${branding?.secondaryColor ?? "#7C3AED"})` }} />
            </div>
          </CardContent>
        </Card>

        {/* Loading text */}
        <Card className="border-0 shadow-md">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Type className="w-4 h-4" /> Loading Screen</CardTitle></CardHeader>
          <CardContent>
            <label className="text-sm font-medium mb-1.5 block">Loading Text</label>
            <Input value={branding?.loadingText ?? ""}
              onChange={(e: any) => setBranding((p: any) => ({ ...(p ?? {}), loadingText: e?.target?.value ?? "" }))}
              placeholder="Loading your flipbook..." />
          </CardContent>
        </Card>

        {saveError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> Failed to save branding. Please try again.
          </div>
        )}
        <Button onClick={handleSave} disabled={saving}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700" size="lg">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : saved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Branding"}
        </Button>
      </motion.div>
    </div>
  );
}
