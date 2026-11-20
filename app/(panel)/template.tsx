// Re-mounts on every tab change: a short fade/slide between pages (disabled under prefers-reduced-motion).
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter h-full">{children}</div>;
}
