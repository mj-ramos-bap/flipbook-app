export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { deleteFile, getFileUrl } from "@/lib/s3";
import { signUuid } from "@/lib/link-token";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const flipbook = await prisma.flipbook.findUnique({
      where: { id: params?.id ?? "" },
      include: { _count: { select: { views: true } } },
    });
    if (!flipbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let pdfUrl: string | null = null;
    try { pdfUrl = await getFileUrl(flipbook.cloudStoragePath, flipbook.isPublic); } catch {}
    let thumbnailUrl: string | null = null;
    if (flipbook?.thumbnailPath) {
      try { thumbnailUrl = await getFileUrl(flipbook.thumbnailPath, flipbook?.thumbnailIsPublic ?? true); } catch {}
    }
    const shareToken = signUuid(flipbook.uuid);
    return NextResponse.json({ flipbook: { ...flipbook, pdfUrl, thumbnailUrl, shareToken } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const flipbook = await prisma.flipbook.update({
      where: { id: params?.id ?? "" },
      data: {
        ...(body?.title !== undefined && { title: body.title }),
        ...(body?.description !== undefined && { description: body.description }),
        ...(body?.passwordProtected !== undefined && { passwordProtected: body.passwordProtected }),
        ...(body?.password !== undefined && { password: body.password }),
        ...(body?.domainRestriction !== undefined && { domainRestriction: body.domainRestriction }),
        ...(body?.allowedDomains !== undefined && { allowedDomains: body.allowedDomains }),
        ...(body?.pagesPerView !== undefined && { pagesPerView: body.pagesPerView }),
        ...(body?.enableShare !== undefined && { enableShare: body.enableShare }),
        ...(body?.enablePrint !== undefined && { enablePrint: body.enablePrint }),
        ...(body?.enableDownload !== undefined && { enableDownload: body.enableDownload }),
        ...(body?.enableAnimatedFlip !== undefined && { enableAnimatedFlip: body.enableAnimatedFlip }),
        ...(body?.enablePageSound !== undefined && { enablePageSound: body.enablePageSound }),
        ...(body?.pageCount !== undefined && { pageCount: body.pageCount }),
        ...(body?.thumbnailPath !== undefined && { thumbnailPath: body.thumbnailPath }),
        ...(body?.thumbnailIsPublic !== undefined && { thumbnailIsPublic: body.thumbnailIsPublic }),
        ...(body?.status !== undefined && { status: body.status }),
      },
    });
    return NextResponse.json({ flipbook });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const flipbook = await prisma.flipbook.findUnique({ where: { id: params?.id ?? "" } });
    if (!flipbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
    try { await deleteFile(flipbook.cloudStoragePath); } catch {}
    if (flipbook?.thumbnailPath) { try { await deleteFile(flipbook.thumbnailPath); } catch {} }
    await prisma.flipbook.delete({ where: { id: params?.id ?? "" } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
