import TopBar from "@/components/TopBar";

// Reads PAPERCLIP_MOCK at request time, not at build time.
export const dynamic = "force-dynamic";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <TopBar mock={process.env.PAPERCLIP_MOCK === "1"} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
