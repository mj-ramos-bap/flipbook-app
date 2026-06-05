export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request, { params }: { params: { uuid: string } }) {
  try {
    const body = (await req.json()) ?? {};
    const flipbook = await prisma.flipbook.findUnique({ where: { uuid: params?.uuid ?? "" } });
    if (!flipbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")?.[0]?.trim?.() ?? req.headers.get("x-real-ip") ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "";
    const referer = req.headers.get("referer") ?? "";

    if (body?.type === "view") {
      const sid = body?.sessionId ?? "unknown";
      // Check if this session already has a view (prevents duplicates from page refreshes)
      const existing = await prisma.flipbookView.findFirst({
        where: { flipbookId: flipbook.id, sessionId: sid },
      });
      if (!existing) {
        await prisma.flipbookView.create({
          data: {
            flipbookId: flipbook.id,
            sessionId: sid,
            ipAddress: ip,
            userAgent: ua,
            referrer: referer,
            duration: body?.duration ?? 0,
            country: body?.country ?? null,
            city: body?.city ?? null,
          },
        });
      }
    } else if (body?.type === "page") {
      await prisma.pageView.create({
        data: {
          flipbookId: flipbook.id,
          sessionId: body?.sessionId ?? "unknown",
          pageNumber: body?.pageNumber ?? 1,
          duration: body?.duration ?? 0,
        },
      });
    } else if (body?.type === "update-duration") {
      // Update the last view's duration
      const lastView = await prisma.flipbookView.findFirst({
        where: { flipbookId: flipbook.id, sessionId: body?.sessionId ?? "" },
        orderBy: { createdAt: "desc" },
      });
      if (lastView) {
        await prisma.flipbookView.update({
          where: { id: lastView.id },
          data: { duration: body?.duration ?? 0 },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
