export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let branding = await prisma.brandingSettings.findFirst();
    if (!branding) {
      branding = await prisma.brandingSettings.create({
        data: { id: "default", primaryColor: "#4F46E5", secondaryColor: "#7C3AED", loadingText: "Loading your flipbook..." },
      });
    }
    const logoUrl = branding?.logoPath ? "/api/branding/logo" : null;
    return NextResponse.json({ branding: { ...branding, logoUrl } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) ?? {};
    let branding = await prisma.brandingSettings.findFirst();
    if (!branding) {
      branding = await prisma.brandingSettings.create({
        data: { id: "default" },
      });
    }
    const updated = await prisma.brandingSettings.update({
      where: { id: branding.id },
      data: {
        ...(body?.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body?.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body?.loadingText !== undefined && { loadingText: body.loadingText }),
        ...(body?.logoPath !== undefined && { logoPath: body.logoPath }),
        ...(body?.logoIsPublic !== undefined && { logoIsPublic: body.logoIsPublic }),
      },
    });
    return NextResponse.json({ branding: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
