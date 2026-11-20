"use client";
// Artifact chips and the artifact drawer (Markdown, sandboxed HTML, image/PDF preview, download).
import { useEffect, useRef, useState } from "react";
import { api, formatBytes } from "@/lib/client";
import type { Artifact } from "@/lib/types";
import { Markdown, Notice } from "./ui";

type Kind = "markdown" | "html" | "image" | "pdf" | "file";

export function artifactKind(a: Artifact): Kind {
  const t = a.contentType;
  if (a.source === "document" || t.includes("markdown") || /\.md$/i.test(a.title)) return "markdown";
  if (t.includes("html")) return "html";
  if (t.startsWith("image/") && !t.includes("svg")) return "image";
  if (t === "application/pdf") return "pdf";
  return "file";
}

const KIND_LABEL: Record<Kind, string> = { markdown: "Document", html: "HTML page", image: "Image", pdf: "PDF", file: "File" };

function contentUrl(a: Artifact) {
  return `/api/attachments/${encodeURIComponent(a.attachmentId ?? "")}/content`;
}

export function downloadUrl(a: Artifact) {
  return a.source === "document"
    ? `/api/issues/${encodeURIComponent(a.issueId ?? "")}/documents/${encodeURIComponent(a.documentKey ?? "")}?download=1`
    : `${contentUrl(a)}?download=1`;
}

function fileLabel(a: Artifact) {
  const ext = a.title.includes(".") ? a.title.split(".").pop()!.toUpperCase() : "";
  return artifactKind(a) === "file" && ext ? ext : KIND_LABEL[artifactKind(a)];
}

export function KindIcon({ kind }: { kind: Kind }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3 } as const;
  if (kind === "html")
    return (
      <svg {...common} aria-hidden>
        <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (kind === "image")
    return (
      <svg {...common} aria-hidden>
        <rect x="2" y="3" width="12" height="10" rx="2" />
        <path d="m3 12 3.5-3.5L9 11l2-2 2 2" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <path d="M4 2h5l3 3v9H4z" strokeLinejoin="round" />
      <path d="M9 2v3h3" strokeLinejoin="round" />
      {kind === "markdown" && <path d="M6 9h4M6 11h3" strokeLinecap="round" />}
    </svg>
  );
}

export function ArtifactChip({ artifact, active, onOpen }: { artifact: Artifact; active?: boolean; onOpen: (a: Artifact) => void }) {
  const kind = artifactKind(artifact);
  return (
    <button
      onClick={() => onOpen(artifact)}
      className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
        active ? "border-deep-teal/50 bg-soft-paper" : "border-warm-mist bg-soft-paper hover:border-graphite/50"
      }`}
    >
      <span className="text-graphite">
        <KindIcon kind={kind} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body text-ink">{artifact.title}</span>
        <span className="block text-caption text-graphite">
          {fileLabel(artifact)}
          {artifact.size !== null && ` · ${formatBytes(artifact.size)}`}
        </span>
      </span>
    </button>
  );
}

function ArtifactBody({ artifact }: { artifact: Artifact }) {
  const kind = artifactKind(artifact);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (kind !== "markdown" && kind !== "html") return;
    let cancelled = false;
    const load = async () => {
      if (artifact.source === "document") {
        const doc = await api<{ body: string }>(
          `/api/issues/${encodeURIComponent(artifact.issueId ?? "")}/documents/${encodeURIComponent(artifact.documentKey ?? "")}`,
        );
        return doc.body;
      }
      const res = await fetch(contentUrl(artifact), { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    };
    load()
      .then((t) => !cancelled && setText(t))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [artifact, kind, attempt]);

  if (failed)
    return (
      <Notice
        title="Could not load this artifact"
        text="Paperclip may not be reachable right now."
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );

  if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={contentUrl(artifact)} alt={artifact.title} className="mx-auto max-h-full max-w-full rounded-xl" />;
  if (kind === "pdf") return <iframe title={artifact.title} src={contentUrl(artifact)} className="h-full w-full rounded-xl border border-warm-mist" />;
  if (kind === "file")
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-graphite">
          <KindIcon kind="file" />
        </span>
        <p className="text-body-lg">{artifact.title}</p>
        <p className="text-body text-graphite">
          {fileLabel(artifact)}
          {artifact.size !== null && ` · ${formatBytes(artifact.size)}`} · no preview for this file type
        </p>
        <a href={downloadUrl(artifact)} className="rounded-xl bg-ink px-4 py-2 text-body text-parchment">
          Download
        </a>
      </div>
    );
  if (text === null) return <p className="p-4 text-body text-graphite">Loading…</p>;
  if (kind === "html")
    return (
      // Untrusted agent HTML: scripts may run, but never with the panel's origin (no allow-same-origin).
      <iframe title={artifact.title} sandbox="allow-scripts" srcDoc={text} className="h-full w-full rounded-xl border border-warm-mist bg-white" />
    );
  return (
    <div className="mx-auto max-w-[760px] px-1 pb-8">
      <Markdown>{text}</Markdown>
    </div>
  );
}

/**
 * The drawer. `column` sits in the page flow (Chat's right column); `overlay` slides over the page (Dashboard).
 * Resizable from its left edge, can expand to full width, and closes.
 */
export function ArtifactDrawer({ artifact, onClose, mode }: { artifact: Artifact; onClose: () => void; mode: "column" | "overlay" }) {
  const [width, setWidth] = useState(520);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const kind = artifactKind(artifact);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const max = Math.max(360, window.innerWidth * 0.75);
      setWidth(Math.min(max, Math.max(320, drag.current.w + drag.current.x - e.clientX)));
    };
    const up = () => {
      drag.current = null;
      document.body.style.userSelect = "";
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const placement = expanded
    ? "fixed inset-x-0 bottom-0 top-14 z-30"
    : mode === "overlay"
      ? "fixed bottom-0 right-0 top-14 z-30 shadow-subtle"
      : "relative h-full shrink-0";

  return (
    <aside className={`${placement} flex flex-col border-l border-warm-mist bg-parchment`} style={expanded ? undefined : { width }} aria-label="Artifact">
      {!expanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: width };
            document.body.style.userSelect = "none";
          }}
          className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-deep-teal/10"
        />
      )}
      <div className="flex items-center gap-3 border-b border-warm-mist/70 px-4 py-3">
        <span className="text-graphite">
          <KindIcon kind={kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-ink">{artifact.title}</p>
          <p className="truncate text-caption text-graphite">
            {fileLabel(artifact)}
            {artifact.agentName && ` · ${artifact.agentName}`}
            {artifact.issueTitle && ` · ${artifact.issueTitle}`}
          </p>
        </div>
        <a href={downloadUrl(artifact)} className="rounded-md border border-warm-mist px-3 py-1.5 text-body-sm text-graphite hover:text-ink">
          Download
        </a>
        <IconButton label={expanded ? "Restore width" : "Expand to full width"} onClick={() => setExpanded((v) => !v)}>
          {expanded ? <path d="M6 2v4H2M10 14v-4h4" /> : <path d="M2 6V2h4M14 10v4h-4" />}
        </IconButton>
        <IconButton label="Close" onClick={onClose}>
          <path d="m4 4 8 8M12 4l-8 8" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ArtifactBody key={artifact.id} artifact={artifact} />
      </div>
    </aside>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="rounded-md p-1.5 text-graphite hover:bg-warm-mist/40 hover:text-ink">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
