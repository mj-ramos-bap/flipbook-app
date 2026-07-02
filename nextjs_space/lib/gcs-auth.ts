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

// Cache the service account email (stable for the lifetime of the container)
let _serviceAccountEmail: string | null = null;

async function getServiceAccountEmail(): Promise<string | null> {
  if (_serviceAccountEmail) return _serviceAccountEmail;
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    if (!res.ok) return null;
    _serviceAccountEmail = (await res.text()).trim();
    return _serviceAccountEmail;
  } catch {
    return null;
  }
}

// Signed URLs for page images use a bucketed expiry: the expiry timestamp is
// snapped to a 12-hour window, so every request within the same window produces
// byte-identical URLs (same string-to-sign → same signature). This makes the
// browser cache effective across visits and lets us cache signatures in memory,
// avoiding one signBlob API call per page on every book open. URLs are valid
// for 12–24h depending on when in the window they were issued.
const SIGN_WINDOW_SECONDS = 12 * 3600;

function bucketedExpiry(): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return (Math.floor(nowSec / SIGN_WINDOW_SECONDS) + 2) * SIGN_WINDOW_SECONDS;
}

// key: `${expiry}:${bucket}/${path}` → full signed URL
const _signedUrlCache = new Map<string, string>();

// Generates signed URLs for multiple objects in parallel.
// Fetches the ADC token and service account email once, then signs all paths
// concurrently — skipping any URL already cached for the current window.
export async function generateGcsSignedUrls(
  bucketName: string,
  objectPaths: string[]
): Promise<(string | null)[]> {
  if (objectPaths.length === 0) return [];
  try {
    const expiry = bucketedExpiry();

    // Serve everything we can from the cache without touching auth at all
    const cacheKeys = objectPaths.map((p) => `${expiry}:${bucketName}/${p}`);
    if (cacheKeys.every((k) => _signedUrlCache.has(k))) {
      return cacheKeys.map((k) => _signedUrlCache.get(k)!);
    }

    const [token, serviceAccount] = await Promise.all([
      getGcsToken(),
      getServiceAccountEmail(),
    ]);
    if (!token || !serviceAccount) return objectPaths.map(() => null);

    // Drop stale entries once the cache gets large (keys embed the expiry, so
    // entries from previous windows are dead weight)
    if (_signedUrlCache.size > 50_000) _signedUrlCache.clear();

    return Promise.all(
      objectPaths.map(async (objectPath, i) => {
        const cached = _signedUrlCache.get(cacheKeys[i]);
        if (cached) return cached;
        try {
          const stringToSign = `GET\n\n\n${expiry}\n/${bucketName}/${objectPath}`;
          const payload = Buffer.from(stringToSign).toString('base64');

          const signRes = await fetch(
            `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signBlob`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ payload }),
            }
          );
          if (!signRes.ok) return null;
          const { signedBlob } = await signRes.json();
          if (!signedBlob) return null;

          const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
          const params = new URLSearchParams({
            GoogleAccessId: serviceAccount,
            Expires: String(expiry),
            Signature: signedBlob,
          });
          const url = `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodedPath}?${params.toString()}`;
          _signedUrlCache.set(cacheKeys[i], url);
          return url;
        } catch {
          return null;
        }
      })
    );
  } catch {
    return objectPaths.map(() => null);
  }
}

// Generates a short-lived GCS V2 signed URL so the browser can download directly
// from GCS without routing through Cloud Run. Falls back to null outside GCP.
export async function generateGcsSignedUrl(
  bucketName: string,
  objectPath: string,
  expiresInSeconds = 900 // 15 minutes
): Promise<string | null> {
  try {
    const [token, serviceAccount] = await Promise.all([
      getGcsToken(),
      getServiceAccountEmail(),
    ]);
    if (!token || !serviceAccount) return null;

    const expiry = Math.floor(Date.now() / 1000) + expiresInSeconds;
    // GCS V2 canonical string to sign — objectPath must NOT be URL-encoded here
    const stringToSign = `GET\n\n\n${expiry}\n/${bucketName}/${objectPath}`;
    const payload = Buffer.from(stringToSign).toString("base64");

    const signRes = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signBlob`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      }
    );
    if (!signRes.ok) return null;
    const { signedBlob } = await signRes.json();
    if (!signedBlob) return null;

    // Build the signed URL — objectPath segments are URL-encoded in the path
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const params = new URLSearchParams({
      GoogleAccessId: serviceAccount,
      Expires: String(expiry),
      Signature: signedBlob, // already base64; URLSearchParams handles URL-encoding
    });
    return `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodedPath}?${params.toString()}`;
  } catch {
    return null;
  }
}
