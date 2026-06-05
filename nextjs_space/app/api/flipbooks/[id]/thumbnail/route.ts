export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getBucketConfig } from "@/lib/aws-config";
import { getGcsToken } from "@/lib/gcs-auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const flipbook = await prisma.flipbook.findUnique({ where: { id: params?.id ?? "" } });
    if (!flipbook?.thumbnailPath) return NextResponse.json({ error: "No thumbnail" }, { status: 404 });

    const { bucketName } = getBucketConfig();
    const token = await getGcsToken();
    if (!token) return NextResponse.json({ error: "Auth unavailable" }, { status: 500 });

    const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(flipbook.thumbnailPath)}?alt=media`;
    const gcsRes = await fetch(gcsUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!gcsRes.ok) return NextResponse.json({ error: "Not found" }, { status: gcsRes.status });

    return new Response(gcsRes.body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
