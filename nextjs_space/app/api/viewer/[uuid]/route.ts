export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";
import { verifyUuid } from "@/lib/link-token";
import { generateGcsSignedUrl, generateGcsSignedUrls } from "@/lib/gcs-auth";
import { getBucketConfig } from "@/lib/aws-config";

export async function GET(req: Request, { params }: { params: { uuid: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("t");

    // If a token is present it must be valid — prevents link tampering.
    // If absent, access is still allowed for backwards compatibility with existing embeds.
    if (token && !verifyUuid(params?.uuid ?? "", token)) {
      return NextResponse.json({ error: "Invalid link" }, { status: 403 });
    }

    const flipbook = await prisma.flipbook.findUnique({
      where: { uuid: params?.uuid ?? "" },
    });
    if (!flipbook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Domain restriction check
    if (flipbook?.domainRestriction && flipbook?.allowedDomains) {
      const referer = req.headers.get("referer") ?? "";
      const allowedList = (flipbook.allowedDomains ?? "").split(",").map((d: string) => d?.trim?.()?.toLowerCase?.() ?? "").filter(Boolean);
      if (allowedList?.length > 0 && referer) {
        try {
          const refDomain = new URL(referer)?.hostname?.toLowerCase?.() ?? "";
          const allowed = allowedList?.some?.((d: string) => refDomain?.includes?.(d ?? "") ?? false) ?? false;
          if (!allowed) {
            return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
          }
        } catch {}
      }
    }

    // Try to serve PDF via a short-lived GCS signed URL (browser downloads directly
    // from GCS, bypassing Cloud Run — faster and supports range requests natively).
    // Falls back to the server-side proxy for local dev where ADC is unavailable.
    const { bucketName } = getBucketConfig();

    // Generate pre-rendered page image URLs in parallel with the PDF URL
    const isRendered = flipbook.renderStatus === 'done';
    const renderedCount = flipbook.renderedPageCount ?? 0;

    const [signedUrl, pageImageUrls, branding] = await Promise.all([
      generateGcsSignedUrl(bucketName, flipbook.cloudStoragePath),
      isRendered && renderedCount > 0
        ? generateGcsSignedUrls(
            bucketName,
            // URLs are stable within a 12h window and valid 12–24h (see gcs-auth)
            Array.from({ length: renderedCount }, (_, i) => `rendered/${flipbook.uuid}/p${i + 1}.jpg`)
          )
        : Promise.resolve(null),
      prisma.brandingSettings.findFirst(),
    ]);

    const pdfUrl = signedUrl ?? `/api/viewer/${flipbook.uuid}/pdf`;
    const logoUrl = branding?.logoPath ? "/api/branding/logo" : null;

    return NextResponse.json({
      id: flipbook?.id,
      uuid: flipbook?.uuid,
      title: flipbook?.title,
      pageCount: flipbook?.pageCount,
      pdfUrl,
      pageImageUrls: pageImageUrls ?? null,
      passwordProtected: flipbook?.passwordProtected ?? false,
      pagesPerView: flipbook?.pagesPerView ?? "double",
      enableShare: flipbook?.enableShare ?? true,
      enablePrint: flipbook?.enablePrint ?? false,
      enableDownload: flipbook?.enableDownload ?? false,
      enableAnimatedFlip: flipbook?.enableAnimatedFlip ?? true,
      enablePageSound: flipbook?.enablePageSound ?? true,
      branding: {
        primaryColor: branding?.primaryColor ?? "#4F46E5",
        secondaryColor: branding?.secondaryColor ?? "#7C3AED",
        loadingText: branding?.loadingText ?? "Loading your flipbook...",
        logoUrl,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
