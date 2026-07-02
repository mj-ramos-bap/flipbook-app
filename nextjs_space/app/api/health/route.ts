// Lightweight keep-warm endpoint pinged by Cloud Scheduler.
// Deliberately touches no database or GCS — its only job is to keep the
// Cloud Run instance alive so viewer links load without a cold start.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true });
}
