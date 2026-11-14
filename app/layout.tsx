import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veyra AI — Imagine it. Bring it to life.",
  description: "A creative studio for AI-generated images, photo editing and cinematic video.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
