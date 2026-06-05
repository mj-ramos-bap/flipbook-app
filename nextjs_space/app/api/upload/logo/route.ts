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

    const contentType = req.headers.get("content-type") ?? "image/png";
    const ext = contentType.includes("svg") ? "svg" : contentType.includes("jpg") || contentType.includes("jpeg") ? "jpg" : "png";
    const cloud_storage_path = `public/logos/${Date.now()}.${ext}`;

    const { bucketName } = getBucketConfig();
    const token = await getGcsToken();
    if (!token) return NextResponse.json({ error: "GCS auth unavailable" }, { status: 500 });

    // Simple (non-resumable) upload — logos are small enough
    const imageData = await req.arrayBuffer();
    const gcsUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(cloud_storage_path)}`;
    const uploadRes = await fetch(gcsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        "Content-Length": String(imageData.byteLength),
      },
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
