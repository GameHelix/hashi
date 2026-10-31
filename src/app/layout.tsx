import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * The tab icon, drawn inline (two islands joined by a double bridge) so the
 * app ships no image files and the browser never asks for /favicon.ico.
 */
const ICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
  "<rect width='32' height='32' rx='7' fill='#070610'/>" +
  "<path d='M11 14.4h10M11 17.6h10' stroke='#a5f3fc' stroke-width='1.7'/>" +
  "<circle cx='8' cy='16' r='5' fill='#0a1124' stroke='#22d3ee' stroke-width='2'/>" +
  "<circle cx='24' cy='16' r='5' fill='#0d3a31' stroke='#34d399' stroke-width='2'/>" +
  "</svg>";

export const metadata: Metadata = {
  title: "Hashi — bridge-building logic puzzle",
  description:
    "A neon Hashi (Hashiwokakero, Bridges) logic puzzle built with Next.js and TypeScript. Link numbered islands with straight bridges, at most two per pair, none crossing, until every number is met and all islands form one network. Every board is seeded and proven to have exactly one solution.",
  icons: { icon: `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}` },
};

export const viewport: Viewport = {
  themeColor: "#070610",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
