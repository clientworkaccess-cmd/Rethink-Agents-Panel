// Cubicle tag text (pure logic, no Pixi). The tag names the agent; the role only shows in the click card.
import { roleLabel } from "@/lib/agents";

type Named = { name: string; role: string };

/** Tag text per desk, in desk order: the name (or the role, or "AGENT"); duplicates get " 2", " 3". */
export function deskLabels(owners: (Named | null)[]): (string | null)[] {
  const seen = new Map<string, number>();
  return owners.map((a) => {
    if (!a) return null;
    const base = a.name.trim() || roleLabel(a) || "AGENT";
    const key = base.toUpperCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n > 1 ? `${base} ${n}` : base;
  });
}

