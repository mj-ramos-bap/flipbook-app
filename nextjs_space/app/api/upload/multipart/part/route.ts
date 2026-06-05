export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getPresignedUrlForPart } from "@/lib/s3";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { cloud_storage_path, uploadId, partNumber } = (await req.json()) ?? {};
    const url = await getPresignedUrlForPart(cloud_storage_path ?? "", uploadId ?? "", partNumber ?? 1);
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
