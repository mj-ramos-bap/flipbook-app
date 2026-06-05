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
    const views = await prisma.flipbookView.findMany({
      where: { flipbookId: params?.id ?? "" },
      orderBy: { createdAt: "desc" },
    });
    const headers = ["Date", "Session ID", "IP Address", "Country", "City", "Duration (sec)", "Referrer"];
    const rows = (views ?? []).map((v: any) => [
      new Date(v?.createdAt ?? Date.now()).toISOString(),
      v?.sessionId ?? "",
      v?.ipAddress ?? "",
      v?.country ?? "",
      v?.city ?? "",
      String(v?.duration ?? 0),
      v?.referrer ?? "",
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="analytics-${params?.id ?? "export"}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
