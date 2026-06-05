export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { uuid: string } }) {
  try {
    const { password } = (await req.json()) ?? {};
    const flipbook = await prisma.flipbook.findUnique({ where: { uuid: params?.uuid ?? "" } });
    if (!flipbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!flipbook?.passwordProtected) return NextResponse.json({ valid: true });
    const valid = password === flipbook?.password;
    return NextResponse.json({ valid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
