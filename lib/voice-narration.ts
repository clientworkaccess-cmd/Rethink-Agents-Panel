// What Talk mode says while the agent works, without a model: an instant acknowledgement built from the
// transcript, and short spoken progress mapped from the run's progress lines. Tune the words and rates here.

/* ------------------------------------------------------------------ acknowledgement */

/** Site names, matched case-insensitively, spoken as written here. */
export const SITES = ["Mount Holly", "Catawba", "Hamshire"];

/** Time phrases, spoken as written. Longest first. */
export const TIMES = [
  "last week", "this week", "next week", "last month", "this month", "next month", "last year", "this year",
  "yesterday", "today", "tomorrow", "this quarter", "last quarter", "year to date", "this weekend",
];

/** Metric words; the spoken form is the value. */
export const METRICS: Record<string, string> = {
  leads: "leads", lead: "leads", calls: "calls", call: "calls", traffic: "traffic", visits: "traffic",
  "move-ins": "move-ins", "move ins": "move-ins", "move-in": "move-ins", "move-outs": "move-outs", "move outs": "move-outs",
  occupancy: "occupancy", rates: "rates", rate: "rates", pricing: "pricing", prices: "pricing", revenue: "revenue",
  reviews: "reviews", ads: "ads", campaign: "the campaign", competitors: "competitors", units: "units",
};

/** Intent verbs, first match wins. `{x}` is what was asked about. */
export const INTENTS: { match: RegExp; verbs: string[] }[] = [
  { match: /\b(compare|versus|vs\.?|against|difference)\b/i, verbs: ["comparing {x}", "putting {x} side by side"] },
  { match: /\b(write|draft|report|summar(y|ise|ize)|email|post|headline)\b/i, verbs: ["writing up {x}", "drafting {x}"] },
  { match: /\b(pull|get|show|list|give me|numbers|how many|what('s| is| are))\b/i, verbs: ["pulling {x}", "getting {x}"] },
  { match: /\b(why|look into|investigate|figure out|explain)\b/i, verbs: ["looking into {x}", "digging into {x}"] },
  { match: /./, verbs: ["checking {x}", "looking at {x}"] },
];

export const OPENERS = ["Okay,", "Sure,", "Right,", "", "", ""];
export const FALLBACKS = [
  "Got it, let me look into that.",
  "Okay, I'm on it, one moment.",
  "Sure, give me a moment on that.",
  "Right, let me check that for you.",
  "On it, give me just a moment.",
];

let lastAck = "";
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Joins words to a phrase like "Catawba's leads for last week". */
function subject(site: string | null, metric: string | null, time: string | null): string | null {
  if (!site && !metric) return null;
  let s = site && metric ? `${site}'s ${metric}` : (metric ?? `${site}`);
  if (time) s += ` for ${time}`;
  return s;
}

/**
 * A short spoken acknowledgement (6-10 words) from what was said, e.g. "Okay, checking Catawba's leads for
 * last week." Never the same twice in a row.
 */
export function acknowledgement(transcript: string): string {
  const t = transcript.toLowerCase();
  const site = SITES.find((s) => t.includes(s.toLowerCase())) ?? null;
  const time = TIMES.find((w) => t.includes(w)) ?? null;
  const metricKey = Object.keys(METRICS)
    .sort((a, b) => b.length - a.length)
    .find((k) => new RegExp(`\\b${k.replace(/[-]/g, "[- ]?")}\\b`).test(t));
  const what = subject(site, metricKey ? METRICS[metricKey] : null, time);

  for (let attempt = 0; attempt < 6; attempt++) {
    let line: string;
    if (what) {
      const intent = INTENTS.find((i) => i.match.test(transcript))!;
      const verb = pick(intent.verbs).replace("{x}", what);
      const opener = pick(OPENERS);
      line = `${opener ? `${opener} ` : ""}${opener ? verb : verb[0].toUpperCase() + verb.slice(1)}.`;
      if (line.split(/\s+/).length < 4) line = `Okay, ${verb} now.`;
    } else line = pick(FALLBACKS);
    if (line !== lastAck) {
      lastAck = line;
      return line;
    }
  }
  lastAck = FALLBACKS.find((f) => f !== lastAck)!;
  return lastAck;
}

/* ------------------------------------------------------------------ progress */

/**
 * Run progress lines to spoken phrases. Only these phrases are ever spoken: never tool names, paths, ids or
 * code. First match wins.
 */
export const PROGRESS_PHRASES: { match: RegExp; say: string[] }[] = [
  { match: /\b(call(s| log)?|ringcentral|voicemail)\b/i, say: ["Reading the call log…", "Going through the calls…"] },
  { match: /\b(read|open|load|file|document|attachment|sheet|csv)\b/i, say: ["Reading through the files…", "Looking through the documents…"] },
  { match: /\b(query|search|fetch|pull|api|request|look ?up|database|sql|numbers|data)\b/i, say: ["Pulling the numbers…", "Gathering the data…"] },
  { match: /\b(writ|draft|report|summar|document_updated|save)\w*/i, say: ["Writing it up…", "Putting it together…"] },
];
export const GENERIC_PROGRESS = ["Still on it…", "Still working on it…", "Nearly there…"];

export const NARRATION = {
  /** nothing spoken this soon after the acknowledgement */
  QUIET_AFTER_ACK_MS: 3000,
  /** at most one spoken update this often */
  MIN_GAP_MS: 8000,
  /** with no progress events: first update at ~15 s, then every ~20 s */
  NO_EVENTS_FIRST_MS: 15_000,
  NO_EVENTS_EVERY_MS: 20_000,
} as const;

/** A spoken phrase for a progress line, or null if nothing in the whitelist matches. */
export function progressPhrase(line: string): string | null {
  const hit = PROGRESS_PHRASES.find((p) => p.match.test(line));
  return hit ? pick(hit.say) : null;
}

/**
 * Decides when to say what while waiting. Call `next()` about every 250 ms; it returns a phrase to speak (and
 * caption) or null. Respects the quiet period, the minimum gap and never repeats the previous phrase.
 */
export function createNarrator(ackAt: number) {
  let lastSaid = 0;
  let lastPhrase = "";
  let lastLine: string | null = null;
  let pendingLine: string | null = null;
  return {
    next(now: number, line: string | null): string | null {
      if (line && line !== lastLine) {
        lastLine = line;
        pendingLine = line;
      }
      if (now - ackAt < NARRATION.QUIET_AFTER_ACK_MS) return null;
      if (lastSaid && now - lastSaid < NARRATION.MIN_GAP_MS) return null;
      let phrase: string | null = null;
      if (pendingLine) {
        phrase = progressPhrase(pendingLine) ?? pick(GENERIC_PROGRESS);
        pendingLine = null;
      } else {
        const since = now - (lastSaid || ackAt);
        if (since >= (lastSaid ? NARRATION.NO_EVENTS_EVERY_MS : NARRATION.NO_EVENTS_FIRST_MS)) phrase = "Still working on it…";
      }
      if (!phrase) return null;
      if (phrase === lastPhrase) {
        const alt = [...GENERIC_PROGRESS, "Still working on it…"].filter((p) => p !== lastPhrase);
        phrase = pick(alt);
      }
      lastSaid = now;
      lastPhrase = phrase;
      return phrase;
    },
  };
}
