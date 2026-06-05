"use client";
import { useState } from "react";
import { Copy, Check, Code2, Link, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function EmbedPanel({ uuid, title, shareToken }: { uuid: string; title: string; shareToken: string | null }) {
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("700");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const baseUrl = typeof window !== "undefined" ? `${window?.location?.origin ?? ""}/view/${uuid}` : `/view/${uuid}`;
  const viewUrl = shareToken ? `${baseUrl}?t=${shareToken}` : baseUrl;
  // Responsive wrapper: iframe fills 100% width and the user-specified height.
  // Using a div wrapper ensures the embed scales on any screen size.
  const embedCode = `<div style="position:relative;width:${width};height:${height}px;overflow:hidden;"><iframe src="${viewUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen title="${title}"></iframe></div>`;

  const copyToClipboard = (text: string, type: string) => {
    navigator?.clipboard?.writeText?.(text);
    if (type === "link") { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
    else { setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 2000); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Shareable Link */}
      <Card className="border-0 shadow-md">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Link className="w-4 h-4" /> Shareable Link</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={viewUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" onClick={() => copyToClipboard(viewUrl, "link")}>
              {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
            <a href={viewUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline"><ExternalLink className="w-4 h-4" /></Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Embed Code */}
      <Card className="border-0 shadow-md">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Embed Code</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Width</label>
              <Input value={width} onChange={(e: any) => setWidth(e?.target?.value ?? "100%")} placeholder="100% or 800" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Height (px)</label>
              <Input value={height} onChange={(e: any) => setHeight(e?.target?.value ?? "600")} placeholder="600" />
            </div>
          </div>
          <div className="bg-gray-900 text-green-400 p-4 rounded-xl font-mono text-xs overflow-x-auto">
            {embedCode}
          </div>
          <Button variant="outline" className="w-full" onClick={() => copyToClipboard(embedCode, "embed")}>
            {copiedEmbed ? <Check className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
            {copiedEmbed ? "Copied!" : "Copy Embed Code"}
          </Button>

          {/* Preview */}
          <div>
            <p className="text-sm font-medium mb-2">Preview</p>
            <div className="border rounded-xl overflow-hidden bg-gray-50 p-2">
              <iframe src={viewUrl} width={width} height={`${height}px`} className="rounded-lg w-full" title={title ?? "Preview"} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
