export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const name = body?.name?.trim?.();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const folder = await (prisma as any).folder.updateMany({
      where: { id: params.id, userId: (session.user as any)?.id },
      data: { name },
    });
    return NextResponse.json({ folder });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Unlink all flipbooks in this folder first
    await prisma.flipbook.updateMany({
      where: { folderId: params.id } as any,
      data: { folderId: null } as any,
    });

    await (prisma as any).folder.deleteMany({
      where: { id: params.id, userId: (session.user as any)?.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
