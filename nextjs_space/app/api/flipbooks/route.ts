export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId");
    const where: any = folderId === "none" ? { folderId: null } : folderId ? { folderId } : {};
    const flipbooks = await prisma.flipbook.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { views: true } } },
    });
    const withThumbnails = (flipbooks ?? []).map((fb: any) => ({
      ...fb,
      thumbnailUrl: fb?.thumbnailPath ? `/api/flipbooks/${fb.id}/thumbnail` : null,
    }));
    return NextResponse.json({ flipbooks: withThumbnails });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const flipbook = await prisma.flipbook.create({
      data: {
        title: body?.title ?? "Untitled",
        description: body?.description ?? null,
        userId: (session.user as any)?.id ?? "",
        cloudStoragePath: body?.cloudStoragePath ?? "",
        isPublic: body?.isPublic ?? false,
        pageCount: body?.pageCount ?? 0,
        fileSize: body?.fileSize ?? 0,
        status: "ready",
        ...(body?.folderId ? { folderId: body.folderId } : {}),
      } as any,
    });
    return NextResponse.json({ flipbook });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
