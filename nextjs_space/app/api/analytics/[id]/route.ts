export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const flipbookId = params?.id ?? "";
    const totalViews = await prisma.flipbookView.count({ where: { flipbookId } });
    const uniqueVisitors = await prisma.flipbookView.groupBy({
      by: ["ipAddress"], where: { flipbookId }
    }).then((r: any) => r?.length ?? 0);
    const avgResult = await prisma.flipbookView.aggregate({
      where: { flipbookId, duration: { gt: 0 } }, _avg: { duration: true }
    });
    const avgDuration = Math.round(avgResult?._avg?.duration ?? 0);

    // Views over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const viewsOverTime = await prisma.flipbookView.findMany({
      where: { flipbookId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const dailyViews: Record<string, number> = {};
    (viewsOverTime ?? []).forEach((v: any) => {
      const date = new Date(v?.createdAt ?? Date.now()).toISOString().split("T")[0] ?? "";
      dailyViews[date] = (dailyViews[date] ?? 0) + 1;
    });

    // Page analytics
    const pageViews = await prisma.pageView.groupBy({
      by: ["pageNumber"],
      where: { flipbookId },
      _count: { pageNumber: true },
      _avg: { duration: true },
      orderBy: { pageNumber: "asc" },
    });

    // Country data
    const countryViews = await prisma.flipbookView.groupBy({
      by: ["country"],
      where: { flipbookId, country: { not: null } },
      _count: { country: true },
      orderBy: { _count: { country: "desc" } },
    });

    // Recent views
    const recentViews = await prisma.flipbookView.findMany({
      where: { flipbookId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, duration: true, country: true, city: true, ipAddress: true },
    });

    return NextResponse.json({
      totalViews, uniqueVisitors, avgDuration,
      dailyViews: Object.entries(dailyViews ?? {}).map(([date, count]: [string, number]) => ({ date, count })),
      pageViews: (pageViews ?? []).map((p: any) => ({
        pageNumber: p?.pageNumber ?? 0,
        views: p?._count?.pageNumber ?? 0,
        avgDuration: Math.round(p?._avg?.duration ?? 0),
      })),
      countryViews: (countryViews ?? []).map((c: any) => ({
        country: c?.country ?? "Unknown",
        views: c?._count?.country ?? 0,
      })),
      recentViews,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
