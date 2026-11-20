import type { Metadata } from "next";
import "@fontsource/lustria/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/martian-mono/400.css";
import "@fontsource/martian-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agents Panel",
  description: "A simple view of the agent team: office, dashboard and chat.",
  robots: { index: false, follow: false },
};

// Sets data-theme before first paint: the saved choice, else the system setting. Avoids a light flash in dark mode.
const THEME_BOOT = `(function(){try{var s=localStorage.getItem('panel-theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
