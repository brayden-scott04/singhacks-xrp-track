import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const DESCRIPTION =
  "AI providers bid via HTTP 402. XRPL settles the winner. Every payment carries its own justification.";

export const metadata: Metadata = {
  title: "BidStream",
  description: DESCRIPTION,
  openGraph: {
    title: "BidStream",
    description: DESCRIPTION,
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
};

/**
 * Applies the stored theme/density before first paint. Without this the
 * page renders in the OS theme and then swaps, which flashes on every load.
 * `suppressHydrationWarning` on <html> is required because this script
 * mutates the element the server just rendered.
 */
const THEME_BOOTSTRAP = `
(function(){try{
  var t=localStorage.getItem('bidstream-theme');
  if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;
  var d=localStorage.getItem('bidstream-density');
  if(d==='present')document.documentElement.dataset.density=d;
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
