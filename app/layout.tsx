import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hydra Trade - AI Powered Trading Platform",
  description: "AI powered crypto trading, automated strategies, P2P escrow, wallet ledgers, and operational risk controls.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/brand/hydra-logo.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/brand/hydra-logo.png", type: "image/png" }],
    shortcut: ["/brand/hydra-logo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
