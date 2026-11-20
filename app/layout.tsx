import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agents Panel",
  description: "A simple view of the agent team: office, dashboard and chat.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
