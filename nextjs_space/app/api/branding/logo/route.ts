export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBucketConfig } from "@/lib/aws-config";
import { getGcsToken } from "@/lib/gcs-auth";

// No auth — logo must be visible to all flipbook viewers (public URLs)
export async function GET() {
  try {
    const branding = await prisma.brandingSettings.findFirst();
    if (!branding?.logoPath) return NextResponse.json({ error: "No logo" }, { status: 404 });

    const { bucketName } = getBucketConfig();
    const token = await getGcsToken();
    if (!token) return NextResponse.json({ error: "Auth unavailable" }, { status: 500 });

    const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(branding.logoPath)}?alt=media`;
    const gcsRes = await fetch(gcsUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!gcsRes.ok) return NextResponse.json({ error: "Not found" }, { status: gcsRes.status });

    const contentType = gcsRes.headers.get("content-type") ?? "image/png";
    return new Response(gcsRes.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
