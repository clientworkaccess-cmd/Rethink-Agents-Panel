import AppShell from "@/components/AppShell";

// Reads PAPERCLIP_MOCK at request time, not at build time.
export const dynamic = "force-dynamic";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <AppShell mock={process.env.PAPERCLIP_MOCK === "1"}>{children}</AppShell>;
}
