export const dynamic = 'force-dynamic';
// Allow up to 10 minutes for long PDFs (Cloud Run timeout must also allow this)
export const maxDuration = 600;

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { renderFlipbookPages } from '@/lib/pdf-renderer';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const flipbook = await prisma.flipbook.findUnique({
      where: { id: params.id },
      select: { id: true, uuid: true, cloudStoragePath: true, renderStatus: true, userId: true },
    });
    if (!flipbook) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    // Idempotent: if already done, return immediately
    if (flipbook.renderStatus === 'done') {
      return new Response('data: {"status":"done"}\n\n', {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const encoder = new TextEncoder();
    let controllerClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          if (controllerClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {}
        };

        try {
          send({ status: 'starting' });

          await renderFlipbookPages(
            flipbook.id,
            flipbook.uuid,
            flipbook.cloudStoragePath,
            (page, total) => send({ status: 'progress', page, total })
          );

          send({ status: 'done' });
        } catch (e: any) {
          send({ status: 'failed', error: e?.message ?? 'Render failed' });
        } finally {
          controllerClosed = true;
          try { controller.close(); } catch {}
        }
      },
      cancel() {
        controllerClosed = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Server error' }), { status: 500 });
  }
}
