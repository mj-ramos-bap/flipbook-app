export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const totalFlipbooks = await prisma.flipbook.count();
    const totalViews = await prisma.flipbookView.count();
    // Count unique visitors by IP address (not sessionId, which changes on every page load)
    const uniqueIps = await prisma.flipbookView.groupBy({ by: ["ipAddress"] }).then((r: any) => r?.length ?? 0);
    // Only average non-zero durations (zero means the duration was never updated)
    const avgResult = await prisma.flipbookView.aggregate({
      _avg: { duration: true },
      where: { duration: { gt: 0 } },
    });
    const avgDuration = Math.round(avgResult?._avg?.duration ?? 0);
    return NextResponse.json({ totalFlipbooks, totalViews, uniqueVisitors: uniqueIps, avgDuration });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
