export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: "FlipBook - Interactive Digital Flipbooks",
  description: "Create and share beautiful interactive flipbooks from your PDF documents",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { images: ["/og-image.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
      </head>
      <body className={`${dmSans.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} font-sans antialiased`} suppressHydrationWarning>
        <style dangerouslySetInnerHTML={{ __html: `[data-hydration-error] { display: none !important; }` }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
