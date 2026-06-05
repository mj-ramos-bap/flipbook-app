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

    // Try ADC first (works on Cloud Run without HMAC)
    const token = await getGcsToken();
    if (token) {
      const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(flipbook.cloudStoragePath)}?alt=media`;
      upstream = await fetch(gcsUrl, { headers: { Authorization: `Bearer ${token}` } });
    }

    // Fallback: HMAC presigned URL (local dev)
    if (!upstream || !upstream.ok) {
      const signedUrl = await getFileUrl(flipbook.cloudStoragePath, false);
      upstream = await fetch(signedUrl);
    }

    if (!upstream || !upstream.ok) {
      const errText = upstream ? await upstream.text() : "No upstream";
      return NextResponse.json({ error: errText }, { status: upstream?.status ?? 500 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
        ...(upstream.headers.get("content-length")
          ? { "Content-Length": upstream.headers.get("content-length")! }
          : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
