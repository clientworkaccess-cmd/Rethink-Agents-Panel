// The character model shared by every renderer (Pixi rig for scenes, SVG for tiny avatars):
// candy colour, head-top variant and role prop, all derived from the agent so it looks the same everywhere.

export type Prop = "tablet" | "megaphone" | "magnifier" | "laptop";
export type Variant = "ears" | "antenna" | "sprout" | "horns" | "tuft";

export type Look = {
  color: number;
  shade: number;
  light: number;
  cheek: number;
  limb: number;
  variant: Variant;
  prop: Prop;
};

/** Pastel candy set, saturated enough to read on white and pop on the dark canvas. */
export const CANDY = [0x86d9a6, 0x8cc4ff, 0xffd166, 0xff9fc6, 0xb9a2ff, 0x6fd8cf, 0xffb07c, 0xc7e36f];

const VARIANTS: Variant[] = ["ears", "antenna", "sprout", "horns", "tuft"];

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
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

export function propFor(role: string, name: string): Prop {
  const s = `${role} ${name}`.toLowerCase();
  if (/\bcro\b|revenue|sales/.test(s)) return "tablet";
  if (/\bcmo\b|market|campaign|brand/.test(s)) return "megaphone";
  if (/analyst|research|pricing|data/.test(s)) return "magnifier";
  return "laptop";
}

export function agentColor(id: string): number {
  return CANDY[hash(id) % CANDY.length];
}

export function lookFor(agent: { id: string; role: string; name: string }): Look {
  const color = agentColor(agent.id);
  return {
    color,
    shade: mix(color, 0x2a1f3d, 0.22),
    light: mix(color, 0xffffff, 0.55),
    cheek: mix(color, 0xff5f8f, 0.45),
    limb: mix(color, 0x2a1f3d, 0.12),
    variant: VARIANTS[hash(agent.id + ":v") % VARIANTS.length],
    prop: propFor(agent.role, agent.name),
  };
}
