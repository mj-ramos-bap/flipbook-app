import { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default function sitemap(): MetadataRoute.Sitemap {
  const headersList = headers();
  const host = headersList.get('x-forwarded-host') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const baseUrl = host?.startsWith?.('http') ? host : `https://${host}`;
  return [
    { url: baseUrl, lastModified: new Date() },
  ];
}
