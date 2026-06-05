export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getBucketConfig } from "@/lib/aws-config";
import { getGcsToken } from "@/lib/gcs-auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cloud_storage_path = `public/thumbnails/${Date.now()}.jpg`;
    const { bucketName } = getBucketConfig();
    const token = await getGcsToken();
    if (!token) return NextResponse.json({ error: "GCS auth unavailable" }, { status: 500 });

    // Initiate resumable upload (private; served through thumbnail proxy)
    const initRes = await fetch(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=resumable&name=${encodeURIComponent(cloud_storage_path)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "image/jpeg",
          ...(req.headers.get("content-length")
            ? { "X-Upload-Content-Length": req.headers.get("content-length")! }
            : {}),
        },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }
    );
    if (!initRes.ok) {
      const err = await initRes.text();
      return NextResponse.json({ error: err }, { status: initRes.status });
    }

    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) return NextResponse.json({ error: "No GCS upload URL" }, { status: 500 });

    const imageData = await req.arrayBuffer();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(imageData.byteLength) },
      body: imageData,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return NextResponse.json({ error: err }, { status: uploadRes.status });
    }

    return NextResponse.json({ cloud_storage_path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
