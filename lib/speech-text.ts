// Turns an agent's Markdown reply into text worth reading aloud, and splits a reply into chunks for read-aloud.
// Pure functions with no browser or server dependencies: the TTS route strips server-side, and mock mode
// (browser speechSynthesis) reuses the same rules on the client.

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/** The most text one read-aloud request may carry (the TTS route rejects more). */
export const MAX_TTS_CHARS = 6000;

/** Inline Markdown to plain text: links become their text, emphasis/code marks go, URLs are not spelled out. */
function inline(line: string): string {
  return (
    line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images: alt text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url)
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1") // [text][ref]
      .replace(/<(https?:\/\/[^>\s]+)>/g, "a link") // <https://…>
      .replace(/https?:\/\/[^\s)]+/g, "a link") // bare URLs
      .replace(/<\/?[a-z][^>]*>/gi, "") // inline HTML tags
      .replace(/`+([^`]+)`+/g, "$1") // inline code
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2") // bold
      .replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1$2") // *italic*
      .replace(/(^|\W)_(?=\S)([^_]*?\S)_(?=\W|$)/g, "$1$2") // _italic_ (not snake_case)
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1") // strikethrough
      .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1") // escapes
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Ends a heading or list item with a pause so the voice does not run it into the next sentence. */
const withStop = (s: string) => (s && !/[.!?:;,]$/.test(s) ? `${s}.` : s);

/**
 * Markdown to speakable text. Code blocks are dropped, a table is read as "Table omitted.", links read as
 * their text, heading/emphasis/list/quote marks are removed. Paragraphs stay separated by a blank line.
 */
export function markdownToSpeech(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join(" ").replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
    current = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE);
    if (fence) {
      // skip to the closing fence (or the end): code is not read aloud
      flush();
      const marker = fence[1][0];
      const len = fence[1].length;
      i++;
      while (i < lines.length && !new RegExp(`^\\s{0,3}\\${marker}{${len},}\\s*$`).test(lines[i])) i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) i++;
      i--;
      paragraphs.push("Table omitted.");
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      continue;
    }
    if (/^\s{0,3}\[[^\]]+\]:\s*\S+/.test(line)) continue; // link reference definition

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flush();
      const text = inline(heading[1]);
      if (text) paragraphs.push(withStop(text));
      continue;
    }
    let body = line.replace(/^\s{0,3}(>\s?)+/, ""); // blockquote
    const item = body.match(/^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (item) {
      // each list item is its own sentence
      flush();
      const text = inline(item[1]);
      if (text) current.push(withStop(text));
      continue;
    }
    body = inline(body);
    if (body) current.push(body);
  }
  flush();
  return paragraphs.join("\n\n");
}

/** Splits long text at sentence ends into pieces of at most `max` characters. */
function bySentence(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + s.length > max) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * Splits a Markdown reply into read-aloud chunks by paragraph (code fences and tables stay whole), so the
 * first chunk can be synthesized and played while the rest are fetched. Very short blocks (headings) join
 * the next one; very long paragraphs split at sentences.
 */
export function splitForSpeech(md: string, max = 1200): string[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence: string | null = null;
  for (const line of lines) {
    const fence = line.match(FENCE);
    if (inFence) {
      cur.push(line);
      if (fence && fence[1][0] === inFence) inFence = null;
      continue;
    }
    if (fence) inFence = fence[1][0];
    if (!line.trim() && !inFence) {
      if (cur.length) blocks.push(cur.join("\n"));
      cur = [];
      continue;
    }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur.join("\n"));

  const chunks: string[] = [];
  let pending = "";
  for (const b of blocks) {
    const block = pending ? `${pending}\n\n${b}` : b;
    pending = "";
    if (block.length < 80 && !FENCE.test(block)) {
      pending = block; // a heading or a one-liner: read it with what follows
      continue;
    }
    if (FENCE.test(block.trimStart()) && block.trimEnd().match(/(`{3,}|~{3,})$/)) continue; // a code block alone reads as nothing
    const whole = FENCE.test(block) || TABLE_SEP.test(block.split("\n")[1] ?? "");
    // code and tables stay whole so the server can drop them, unless they would pass the TTS limit
    if (block.length > (whole ? MAX_TTS_CHARS - 500 : max)) chunks.push(...bySentence(block, max));
    else chunks.push(block);
  }
  if (pending) chunks.push(pending);
  return chunks;
}
