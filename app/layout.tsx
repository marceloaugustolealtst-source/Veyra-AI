import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://veyra-gu0bla83x-financedigital.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Veyra AI — Imagine it. Bring it to life.", template: "%s | Veyra AI" },
  description: "Create stunning AI images, edit photos, and generate cinematic videos in one premium creative studio.",
  applicationName: "Veyra AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Veyra AI", statusBarStyle: "black-translucent" },
  openGraph: { type: "website", siteName: "Veyra AI", title: "Veyra AI — Imagine it. Bring it to life.", description: "Your AI creative studio for images, photo editing and cinematic video.", url: siteUrl, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Veyra AI creative studio" }] },
  twitter: { card: "summary_large_image", title: "Veyra AI — Imagine it. Bring it to life.", description: "Your AI creative studio for images, photo editing and cinematic video.", images: ["/opengraph-image"] },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: ["/icon.svg"] },
};
export const viewport: Viewport = { themeColor: "#08090d", colorScheme: "dark", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}