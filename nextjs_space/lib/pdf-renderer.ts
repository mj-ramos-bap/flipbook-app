// Server-side PDF → JPEG renderer. Requires `pdftoppm` (poppler-utils) installed
// in the Docker image. Called during upload to pre-render all pages so the viewer
// loads images instead of doing per-page pdfjs rendering on every view.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/db';
import { getGcsToken } from '@/lib/gcs-auth';
import { getBucketConfig } from '@/lib/aws-config';

const execFileAsync = promisify(execFile);

async function downloadFromGcs(bucketName: string, objectPath: string): Promise<Buffer> {
  const token = await getGcsToken();
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const url = `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodedPath}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`GCS download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToGcs(
  bucketName: string,
  objectPath: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const token = await getGcsToken();
  // Multipart upload so we can set Cache-Control metadata: without it GCS serves
  // signed-URL responses as uncacheable and browsers re-download every page image
  // on every visit. max-age is kept at 1h so a "Replace PDF" (which overwrites
  // these same object paths) propagates to viewers within the hour.
  const metadata = JSON.stringify({
    name: objectPath,
    contentType,
    cacheControl: 'public, max-age=3600',
  });
  const boundary = 'gcs_upload_boundary_7f3a91';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    ),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=multipart`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  if (!res.ok) {
    const resBody = await res.text().catch(() => '');
    throw new Error(`GCS upload failed: ${res.status} ${resBody}`);
  }
}

export async function renderFlipbookPages(
  flipbookId: string,
  uuid: string,
  cloudStoragePath: string,
  onProgress?: (page: number, total: number) => void
): Promise<void> {
  await prisma.flipbook.update({
    where: { id: flipbookId },
    data: { renderStatus: 'processing' },
  });

  const { bucketName } = getBucketConfig();
  const tmpDir = await mkdtemp(join(tmpdir(), 'fliprender-'));

  try {
    // 1. Download PDF from GCS
    const pdfBuffer = await downloadFromGcs(bucketName, cloudStoragePath);
    const pdfPath = join(tmpDir, 'input.pdf');
    await writeFile(pdfPath, pdfBuffer);

    // 2. Convert all pages to JPEG via pdftoppm (poppler-utils)
    const outPrefix = join(tmpDir, 'page');
    await execFileAsync('pdftoppm', [
      '-jpeg',
      '-r', '220',
      '-jpegopt', 'quality=88',
      pdfPath,
      outPrefix,
    ]);

    // 3. Collect and sort output files (pdftoppm names them page-000001.jpg etc.)
    const allFiles = await readdir(tmpDir);
    const pageFiles = allFiles
      .filter((f) => f.startsWith('page-') && f.endsWith('.jpg'))
      .sort();

    const total = pageFiles.length;
    if (total === 0) throw new Error('pdftoppm produced no output pages');

    // 4. Upload each page to GCS and update progress
    for (let i = 0; i < total; i++) {
      const jpegBuffer = await readFile(join(tmpDir, pageFiles[i]));
      const gcsPath = `rendered/${uuid}/p${i + 1}.jpg`;
      await uploadToGcs(bucketName, gcsPath, jpegBuffer, 'image/jpeg');

      onProgress?.(i + 1, total);

      // Batch DB updates: update every 5 pages or on the last page
      if ((i + 1) % 5 === 0 || i === total - 1) {
        await prisma.flipbook.update({
          where: { id: flipbookId },
          data: { renderedPageCount: i + 1 },
        });
      }
    }

    await prisma.flipbook.update({
      where: { id: flipbookId },
      data: { renderStatus: 'done', renderedPageCount: total },
    });
  } catch (err) {
    console.error('[pdf-renderer] Render failed:', err);
    await prisma.flipbook.update({
      where: { id: flipbookId },
      data: { renderStatus: 'failed' },
    }).catch(() => {});
    throw err;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
