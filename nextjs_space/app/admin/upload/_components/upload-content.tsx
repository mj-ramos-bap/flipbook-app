"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function UploadContent() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e?.dataTransfer?.files?.[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
      if (!title) setTitle(dropped?.name?.replace?.(".pdf", "") ?? "Untitled");
    } else {
      setError("Please upload a PDF file");
    }
  }, [title]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e?.target?.files?.[0];
    if (selected) {
      setFile(selected);
      if (!title) setTitle(selected?.name?.replace?.(".pdf", "") ?? "Untitled");
      setError("");
    }
  };

  const uploadFile = async (f: File): Promise<string> => {
    const res = await fetch("/api/upload/direct", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(f.size),
        "x-file-name": encodeURIComponent(f.name ?? "upload.pdf"),
      },
      body: f,
    });
    const result = (await res.json()) ?? {};
    if (!res.ok) throw new Error(result?.error ?? "Upload failed");
    setProgress(100);
    return result.cloud_storage_path;
  };

  // Renders page 1 as a JPEG thumbnail and returns { pageCount, thumbnailPath }
  const generateThumbnail = async (f: File): Promise<{ pageCount: number; thumbnailPath: string | null }> => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;
      const buf = await f.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const pageCount = doc.numPages ?? 0;

      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const scale = Math.min(480 / vp.width, 360 / vp.height);
      const sv = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sv.width);
      canvas.height = Math.round(sv.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: sv }).promise;

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.85)
      );

      const thumbRes = await fetch("/api/upload/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "Content-Length": String(blob.size) },
        body: blob,
      });
      const thumbData = (await thumbRes.json()) ?? {};
      return { pageCount, thumbnailPath: thumbRes.ok ? (thumbData.cloud_storage_path ?? null) : null };
    } catch {
      return { pageCount: 0, thumbnailPath: null };
    }
  };

  const handleUpload = async () => {
    if (!file) { setError("Please select a PDF file"); return; }
    if (!title?.trim?.()) { setError("Please enter a title"); return; }
    setUploading(true);
    setStatus("uploading");
    setError("");
    setProgress(0);

    try {
      const fileSize = file?.size ?? 0;
      const cloud_storage_path = await uploadFile(file);

      setStatus("processing");

      // Create flipbook record
      const fbRes = await fetch("/api/flipbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title?.trim?.() ?? "Untitled",
          description: description?.trim?.() || null,
          cloudStoragePath: cloud_storage_path,
          isPublic: false,
          fileSize,
        }),
      });
      const { flipbook } = (await fbRes.json()) ?? {};

      // Generate thumbnail + page count from the local file (no re-download needed)
      if (flipbook?.id) {
        const { pageCount, thumbnailPath } = await generateThumbnail(file);
        if (pageCount > 0 || thumbnailPath) {
          await fetch(`/api/flipbooks/${flipbook.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(pageCount > 0 && { pageCount }),
              ...(thumbnailPath && { thumbnailPath, thumbnailIsPublic: false }),
            }),
          });
        }
      }

      setStatus("done");
      setTimeout(() => {
        router.replace(`/admin/flipbooks/${flipbook?.id ?? ""}`);
      }, 1500);
    } catch (e: any) {
      console.error("Upload error:", e);
      setError(e?.message ?? "Upload failed");
      setStatus("error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Upload PDF</h2>
        <p className="text-muted-foreground mt-1">Upload a PDF to create an interactive flipbook</p>
      </div>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6 space-y-6">
          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver ? "border-indigo-400 bg-indigo-50" : file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/50"
            }`}
            onDragOver={(e: any) => { e?.preventDefault?.(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef?.current?.click?.()}
          >
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-10 h-10 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-green-800">{file?.name}</p>
                  <p className="text-sm text-green-600">{((file?.size ?? 0) / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
                <Button variant="ghost" size="icon" className="ml-4" onClick={(e: any) => { e?.stopPropagation?.(); setFile(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-base font-medium">Drag & drop your PDF here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
              </div>
            )}
          </div>

          {/* Title and description */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title *</label>
              <Input
                value={title} onChange={(e: any) => setTitle(e?.target?.value ?? "")}
                placeholder="Enter flipbook title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Input
                value={description} onChange={(e: any) => setDescription(e?.target?.value ?? "")}
                placeholder="Optional description"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Progress */}
          {(status === "uploading" || status === "processing") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{status === "uploading" ? "Uploading..." : "Creating flipbook..."}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {status === "done" && (
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Flipbook created successfully! Redirecting...
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!file || uploading || status === "done"}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            size="lg"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploading ? "Uploading..." : "Create Flipbook"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
