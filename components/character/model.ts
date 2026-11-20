// The character model shared by every renderer (Pixi rig for scenes, SVG for small avatars).
// A Look is derived from the agent's id (skin, hair, outfit colours, accessory) and role (outfit formality,
// prop, floating emblem), so the same agent looks the same everywhere and on every visit.
// The drawing itself lives in art.ts; this file only decides what to draw.

export type Prop = "briefcase" | "tablet" | "megaphone" | "magnifier" | "clipboard" | "laptop" | "calculator";
export type Emblem = "revenue" | "coins" | "star" | "gear" | "target" | "code" | "pie" | "chat" | "bulb";
export type HairStyle = "side" | "crop" | "buzz" | "curly" | "bob" | "long" | "ponytail" | "bun" | "quiff";
export type Outfit = "suit" | "vest" | "shirt" | "sweater" | "blazer" | "turtleneck";
export type Accessory = "none" | "glasses" | "round" | "headset" | "earring";
export type FacialHair = "none" | "beard" | "moustache";
export type RoleKind = "cro" | "cfo" | "ceo" | "coo" | "cmo" | "cto" | "analyst" | "ops" | "support" | "design" | "dev" | "sales" | "default";

export type Look = {
  kind: RoleKind;
  skin: number;
  skinShade: number;
  hair: number;
  hairShade: number;
  brow: number;
  style: HairStyle;
  facial: FacialHair;
  outfit: Outfit;
  /** Jacket / sweater / top colour. */
  top: number;
  shirt: number;
  tie: number | null;
  pants: number;
  shoes: number;
  accessory: Accessory;
  /** Pocket square / small accent (suits, blazers). */
  accent: number;
  prop: Prop;
  emblem: Emblem;
  /** One signature colour per agent (chair stripe, small accents). */
  color: number;
};

const SKIN = [0xfbe0cb, 0xf3c9a6, 0xe2ad85, 0xc98d63, 0xa06a45, 0x7b4b2f];
const HAIR = [0x2a2321, 0x47322a, 0x74492b, 0x9c4f2e, 0xd9b26f, 0x9b9aa1, 0xc2582f, 0x3d2f4f];
const FORMAL = [0x2e3c63, 0x3b3e47, 0x25262c, 0x5f6673, 0x684834, 0x6b2a3a, 0x2e5444, 0x2c5597];
const CASUAL = [0xd59e3c, 0x2f8c87, 0x8a3b4a, 0x6e7a3b, 0x8c7ac6, 0xdf7a5e, 0x5f9fd6, 0xe4d6bc, 0x46607f];
const SHIRTS = [0xf8f8f6, 0xcfe2f6, 0xf5d4dc, 0xe2daf5, 0xd6efe2, 0xf6eec9];
const TIES = [0xc0392b, 0x23395d, 0xc9971a, 0x2e7d55, 0x6c4bb5, 0x1f8a8a, 0x7a1f3d, 0xdd6f2a, 0x8a7a5a];
const PANTS = [0x2b3550, 0x3a3c44, 0xb9a27c, 0x6b6f78, 0x26272c, 0x5b4636];
const SHOES = [0x23211f, 0x5a3523, 0x3a2a20];
/** Signature colours: readable as a thin stripe on both themes. */
export const SIGNATURE = [0x5b8def, 0xe0794f, 0x3fb38a, 0xc85fa8, 0xd4a72c, 0x7b6cf0, 0x2fa7c4, 0xd0574f];

const OUTFITS: Record<RoleKind, Outfit[]> = {
  cro: ["suit", "suit", "vest"],
  cfo: ["suit", "vest", "suit"],
  ceo: ["suit", "suit", "blazer"],
  coo: ["suit", "vest", "blazer"],
  sales: ["suit", "vest", "shirt"],
  cmo: ["blazer", "sweater", "turtleneck", "suit"],
  design: ["turtleneck", "sweater", "blazer"],
  cto: ["sweater", "turtleneck", "blazer", "shirt"],
  dev: ["sweater", "shirt", "turtleneck"],
  analyst: ["shirt", "vest", "sweater"],
  ops: ["shirt", "sweater", "vest", "blazer"],
  support: ["sweater", "shirt", "blazer"],
  default: ["shirt", "sweater", "blazer", "vest"],
};

const KIT: Record<RoleKind, { prop: Prop; emblem: Emblem }> = {
  cro: { prop: "briefcase", emblem: "revenue" },
  sales: { prop: "briefcase", emblem: "revenue" },
  cfo: { prop: "calculator", emblem: "coins" },
  ceo: { prop: "briefcase", emblem: "star" },
  coo: { prop: "clipboard", emblem: "gear" },
  ops: { prop: "clipboard", emblem: "gear" },
  cmo: { prop: "megaphone", emblem: "target" },
  design: { prop: "tablet", emblem: "star" },
  cto: { prop: "laptop", emblem: "code" },
  dev: { prop: "laptop", emblem: "code" },
  analyst: { prop: "magnifier", emblem: "pie" },
  support: { prop: "clipboard", emblem: "chat" },
  default: { prop: "tablet", emblem: "bulb" },
};

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // final avalanche so short ids with a shared prefix still spread
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export const css = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function roleKind(role: string, name: string): RoleKind {
  const s = `${role} ${name}`.toLowerCase().replace(/_/g, " ");
  if (/\bcro\b|revenue/.test(s)) return "cro";
  if (/\bcfo\b|financ|account(?!.*exec)|bookkeep|collection/.test(s)) return "cfo";
  if (/\bceo\b|founder|chief executive/.test(s)) return "ceo";
  if (/\bcoo\b|operations officer/.test(s)) return "coo";
  if (/\bcmo\b|campaign|content|social|marketing/.test(s)) return "cmo";
  if (/\bcto\b|tech lead|architect/.test(s)) return "cto";
  if (/analyst|research|pricing|data scien|insight/.test(s)) return "analyst";
  if (/engineer|developer|\bdev\b|\bit\b/.test(s)) return "dev";
  if (/design/.test(s)) return "design";
  if (/support|customer|service|reception/.test(s)) return "support";
  if (/sales|leasing|account exec/.test(s)) return "sales";
  if (/\bops\b|operation|assistant|admin|facilit|general/.test(s)) return "ops";
  return "default";
}

/** The agent's signature colour (kept from the V2 API). */
export function agentColor(id: string): number {
  return SIGNATURE[hash(id + ":sig") % SIGNATURE.length];
}

export function propFor(role: string, name: string): Prop {
  return KIT[roleKind(role, name)].prop;
}

const memo = new Map<string, Look>();

export function lookFor(agent: { id: string; role: string; name: string }): Look {
  const key = `${agent.id}|${agent.role}|${agent.name}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const pick = <T,>(list: readonly T[], salt: string) => list[hash(`${agent.id}:${salt}`) % list.length];
  const kind = roleKind(agent.role, agent.name);
  const outfit = pick(OUTFITS[kind], "outfit");
  const formal = outfit === "suit" || outfit === "vest";
  const skin = pick(SKIN, "skin");
  // greys, blondes and dyed colours are rarer, so most teams read as a varied but natural group
  const hairIdx = hash(`${agent.id}:hair`) % 11;
  const hair = HAIR[hairIdx < 8 ? hairIdx : hairIdx - 8];
  const style = pick(["side", "crop", "buzz", "curly", "bob", "long", "ponytail", "bun", "quiff"] as const, "style");
  const shortHair = style === "side" || style === "crop" || style === "buzz" || style === "quiff" || style === "curly";
  const fh = hash(`${agent.id}:facial`) % 7;
  const facial: FacialHair = shortHair && fh === 0 ? "beard" : shortHair && fh === 1 ? "moustache" : "none";
  const top =
    formal ? pick(FORMAL, "top") : outfit === "blazer" ? pick([...FORMAL, ...CASUAL.slice(0, 4)], "top") : pick(CASUAL, "top");
  const shirt = outfit === "turtleneck" ? top : pick(outfit === "shirt" || outfit === "vest" ? SHIRTS : SHIRTS.slice(0, 4), "shirt");
  const hasTie = outfit === "suit" || outfit === "vest" || (outfit === "shirt" && hash(`${agent.id}:tie?`) % 3 !== 0);
  const tie = hasTie ? pick(TIES, "tie") : null;
  const pants = outfit === "suit" ? mix(top, 0x000000, 0.12) : pick(PANTS, "pants");
  const accRoll = hash(`${agent.id}:acc`) % 10;
  let accessory: Accessory = accRoll < 2 ? "glasses" : accRoll === 2 ? "round" : accRoll === 4 && !shortHair ? "earring" : "none";
  if (kind === "support") accessory = "headset";
  const kit = KIT[kind];
  const look: Look = {
    kind,
    skin,
    skinShade: mix(skin, 0x8a4a3a, 0.28),
    hair,
    hairShade: mix(hair, 0x000000, 0.3),
    brow: mix(hair, 0x2a2230, hair === HAIR[4] || hair === HAIR[5] ? 0.45 : 0.25),
    style,
    facial,
    outfit,
    top,
    shirt,
    tie,
    pants,
    shoes: pick(SHOES, "shoes"),
    accessory,
    accent: pick([0xffffff, 0xd94f4f, 0xe7c35a, 0x7fb5e8], "accent"),
    prop: kit.prop,
    emblem: kit.emblem,
    color: agentColor(agent.id),
  };
  memo.set(key, look);
  return look;
}
