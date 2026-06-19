export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const folders = await (prisma as any).folder.findMany({
      where: { userId: (session.user as any)?.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { flipbooks: true } } },
    });
    return NextResponse.json({ folders });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const name = body?.name?.trim?.();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const folder = await (prisma as any).folder.create({
      data: {
        name,
        userId: (session.user as any)?.id ?? "",
      },
    });
    return NextResponse.json({ folder });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
