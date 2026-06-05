// Gets a short-lived GCS access token from the Cloud Run metadata server (ADC).
// Falls back gracefully when running outside GCP (local dev).
// Token is cached in memory so concurrent requests share one token and avoid hammering the metadata server.
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

export async function getGcsToken(): Promise<string | null> {
  // Reuse cached token if it has more than 60 seconds remaining
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) {
    return _cachedToken;
  }
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!res.ok) return null;
    const { access_token, expires_in } = await res.json();
    _cachedToken = access_token ?? null;
    _tokenExpiry = Date.now() + (expires_in ?? 3600) * 1000;
    return _cachedToken;
  } catch {
    return null;
  }
}
