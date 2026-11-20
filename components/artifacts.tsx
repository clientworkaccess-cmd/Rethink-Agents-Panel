"use client";
// Artifact cards and the artifact drawer (Markdown, sandboxed HTML, image/PDF preview, download).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatBytes, timeAgo } from "@/lib/client";
import type { Artifact } from "@/lib/types";
import { EmptyState, Icon, IconButton, Loading, Markdown, Mono, buttonClass, cardClass, cx } from "./ui";

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

export function KindIcon({ kind, size = 16 }: { kind: Kind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3 } as const;
  if (kind === "html")
    return (
      <svg {...common} aria-hidden>
        <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (kind === "image")
    return (
      <svg {...common} aria-hidden>
        <rect x="2" y="3" width="12" height="10" rx="1" />
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

/** A small card with an icon, like Claude's artifact chips. */
export function ArtifactChip({ artifact, active, onOpen }: { artifact: Artifact; active?: boolean; onOpen: (a: Artifact) => void }) {
  const kind = artifactKind(artifact);
  return (
    <button
      onClick={() => onOpen(artifact)}
      aria-pressed={active}
      className={cardClass("default", true, cx("inline-flex w-chip max-w-full items-center gap-3 p-2", active && "border-foreground"))}
    >
      <span className="flex size-btn-sm shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <KindIcon kind={kind} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-foreground">{artifact.title}</span>
        <Mono className="truncate">
          {fileLabel(artifact)}
          {artifact.size !== null && ` · ${formatBytes(artifact.size)}`}
        </Mono>
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
      <EmptyState
        mood="error"
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
    return <img src={contentUrl(artifact)} alt={artifact.title} className="mx-auto max-h-full max-w-full rounded-lg" />;
  if (kind === "pdf") return <iframe title={artifact.title} src={contentUrl(artifact)} className="h-full w-full rounded-lg border border-border" />;
  if (kind === "file")
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <KindIcon kind="file" size={20} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-foreground">{artifact.title}</p>
          <p className="text-sm">
            {fileLabel(artifact)}
            {artifact.size !== null && ` · ${formatBytes(artifact.size)}`} · no preview for this file type
          </p>
        </div>
        <a href={downloadUrl(artifact)} className={buttonClass("primary")}>
          <Icon name="download" />
          Download
        </a>
      </div>
    );
  if (text === null) return <Loading label="Opening…" />;
  if (kind === "html")
    return (
      // Untrusted agent HTML: scripts may run, but never with the panel's origin (no allow-same-origin).
      <iframe title={artifact.title} sandbox="allow-scripts" srcDoc={text} className="h-full w-full rounded-lg border border-border bg-preview-canvas" />
    );
  return (
    <div className="mx-auto max-w-chat px-2 pb-8">
      <Markdown doc>{text}</Markdown>
    </div>
  );
}

/**
 * The drawer (the shell's contextual right pane). `column` sits in the page flow (Chat's right column);
 * `overlay` slides over the page (Dashboard). Both are positioned inside a `relative` page container, so
 * "expand" fills the main pane and keeps the left navigation. Resizable from its left edge; closes smoothly.
 */
export function ArtifactDrawer({ artifact, onClose, mode }: { artifact: Artifact; onClose: () => void; mode: "column" | "overlay" }) {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 560 : Math.round(Math.min(600, Math.max(340, window.innerWidth * (mode === "column" ? 0.42 : 0.6))))));
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const kind = artifactKind(artifact);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 180); // matches --motion-duration-base
  }, [onClose]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const max = Math.max(380, window.innerWidth * 0.75);
      setWidth(Math.min(max, Math.max(340, drag.current.w + drag.current.x - e.clientX)));
    };
    const up = () => {
      drag.current = null;
      document.body.style.userSelect = "";
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", esc);
    };
  }, [close]);

  const placement = expanded
    ? "absolute inset-0 z-30"
    : mode === "overlay"
      ? "absolute inset-y-0 right-0 z-30 max-w-full shadow-flyout"
      : "relative h-full min-w-aside-min max-w-drawer";

  return (
    <aside
      key={artifact.id}
      className={cx(
        placement,
        "slide-in-right flex flex-col border-l border-border bg-background transition-[opacity,transform] duration-(--motion-duration-base)",
        closing && "translate-x-6 opacity-0",
      )}
      style={expanded ? undefined : { width }}
      aria-label="Artifact"
    >
      {!expanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the artifact pane"
          title="Drag to resize"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, w: width };
            document.body.style.userSelect = "none";
          }}
          className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize transition-colors duration-(--motion-duration-fast) hover:bg-pane-resize"
        />
      )}
      <div className="flex h-header shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="flex size-btn-sm shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <KindIcon kind={kind} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm font-semibold text-foreground">{artifact.title}</p>
          <Mono className="truncate">
            {fileLabel(artifact)}
            {artifact.agentName && ` · ${artifact.agentName}`}
            {artifact.updatedAt && ` · ${timeAgo(artifact.updatedAt)}`}
          </Mono>
        </div>
        <a href={downloadUrl(artifact)} className={buttonClass("secondary", "sm")}>
          <Icon name="download" className="size-icon-sm" />
          <span className="hidden sm:inline">Download</span>
        </a>
        <IconButton label={expanded ? "Restore width" : "Expand to full width"} onClick={() => setExpanded((v) => !v)}>
          <Icon name={expanded ? "restore" : "expand"} />
        </IconButton>
        <IconButton label="Close" onClick={close}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-auto p-4">
        <ArtifactBody key={artifact.id} artifact={artifact} />
      </div>
    </aside>
  );
}
