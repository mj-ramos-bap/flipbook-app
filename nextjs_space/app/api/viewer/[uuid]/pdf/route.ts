export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBucketConfig } from "@/lib/aws-config";
import { getGcsToken } from "@/lib/gcs-auth";
import { getFileUrl } from "@/lib/s3";

export async function GET(req: Request, { params }: { params: { uuid: string } }) {
  try {
    const flipbook = await prisma.flipbook.findUnique({
      where: { uuid: params?.uuid ?? "" },
    });
    if (!flipbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { bucketName } = getBucketConfig();
    let upstream: Response | null = null;

    // Forward range header so pdfjs can do partial/progressive loading
    const rangeHeader = req.headers.get("range");
    const upstreamHeaders: Record<string, string> = {};
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    // Try ADC first (works on Cloud Run without HMAC)
    const token = await getGcsToken();
    if (token) {
      const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(flipbook.cloudStoragePath)}?alt=media`;
      upstream = await fetch(gcsUrl, { headers: { Authorization: `Bearer ${token}`, ...upstreamHeaders } });
    }

    // Fallback: HMAC presigned URL (local dev)
    if (!upstream || !upstream.ok) {
      const signedUrl = await getFileUrl(flipbook.cloudStoragePath, false);
      upstream = await fetch(signedUrl, { headers: upstreamHeaders });
    }

    if (!upstream || !upstream.ok) {
      const errText = upstream ? await upstream.text() : "No upstream";
      return NextResponse.json({ error: errText }, { status: upstream?.status ?? 500 });
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    if (upstream.headers.get("content-length")) {
      responseHeaders["Content-Length"] = upstream.headers.get("content-length")!;
    }
    if (upstream.headers.get("content-range")) {
      responseHeaders["Content-Range"] = upstream.headers.get("content-range")!;
    }

    return new Response(upstream.body, {
      status: upstream.status, // pass through 206 Partial Content for range requests
      headers: responseHeaders,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
