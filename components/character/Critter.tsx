// SVG rendering of the shared character, for small avatars, loading and empty states (no WebGL context
// needed). It draws the very same shapes as the Pixi rig (art.ts), with the same pivots, so an agent's
// avatar always matches its character in the Office, the lounge and the team strip.
import { artFor, BROW_EXPR, BROW_L, BROW_R, EYE, EYE_CLOSED, EYE_L, EYE_R, HAND, HIP_L, HIP_R, MOUTHS, NECK, SHOULDER_L, SHOULDER_R, type Mouth, type Shape } from "./art";
import { css, lookFor } from "./model";

export type CritterMood = "idle" | "busy" | "wave" | "sleep" | "error" | "happy";

type Props = {
  agent: { id: string; role: string; name: string };
  size?: number;
  mood?: CritterMood;
  /** Head only, for message avatars. */
  head?: boolean;
  className?: string;
  title?: string;
};

const MOOD_MOUTH: Record<CritterMood, Mouth> = { idle: "smile", busy: "flat", wave: "grin", sleep: "sleep", error: "frown", happy: "grin" };
const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10;

function Shapes({ shapes }: { shapes: Shape[] }) {
  return (
    <>
      {shapes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.fill === undefined ? "none" : css(s.fill)}
          fillOpacity={s.alpha}
          stroke={s.line ? css(s.stroke ?? 0) : undefined}
          strokeWidth={s.line}
          strokeLinecap={s.line ? "round" : undefined}
          strokeLinejoin={s.line ? "round" : undefined}
        />
      ))}
    </>
  );
}

export default function Critter({ agent, size = 40, mood = "idle", head = false, className = "", title }: Props) {
  const look = lookFor(agent);
  const art = artFor(look);
  const mouth = MOOD_MOUTH[mood];
  const [by, bt] = BROW_EXPR[mouth];
  const anim = mood === "busy" ? "critter-busy" : mood === "sleep" ? "" : "critter-bob";
  const viewBox = head ? "-23 -81 46 46" : "-30 -86 60 92";
  const waving = mood === "wave";
  const armL = 0.12;
  const armR = waving ? 2.7 : 0.12;
  const eye = mood === "sleep" ? EYE_CLOSED : EYE;
  return (
    <svg
      width={size}
      height={head ? size : (size * 92) / 60}
      viewBox={viewBox}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className={anim}>
        {!head && (
          <>
            <ellipse cx="0" cy="1" rx="14" ry="4" fill="#000" opacity="0.16" />
            <g transform={`translate(${HIP_L.x} ${HIP_L.y})`}>
              <Shapes shapes={art.legL} />
            </g>
            <g transform={`translate(${HIP_R.x} ${HIP_R.y})`}>
              <Shapes shapes={art.legR} />
            </g>
            <Shapes shapes={art.torso} />
            <g transform={`translate(${SHOULDER_L.x} ${SHOULDER_L.y}) rotate(${deg(armL)})`}>
              <Shapes shapes={art.arm} />
            </g>
            <g className={waving ? "critter-wave" : ""}>
              <g transform={`translate(${SHOULDER_R.x} ${SHOULDER_R.y}) rotate(${deg(-armR)})`}>
                <Shapes shapes={art.arm} />
                {!waving && (
                  <g transform={`translate(${HAND.x} ${HAND.y}) rotate(${look.prop === "briefcase" ? deg(armR) : 0})`}>
                    <Shapes shapes={art.prop} />
                  </g>
                )}
              </g>
            </g>
          </>
        )}
        <g transform={`translate(${NECK.x} ${NECK.y})`}>
          <Shapes shapes={art.hairBack} />
          <Shapes shapes={art.ears} />
          <Shapes shapes={art.skull} />
          <Shapes shapes={art.face} />
          {[EYE_L, EYE_R].map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <g className={mood === "sleep" ? "" : "critter-eye"}>
                <Shapes shapes={eye} />
              </g>
            </g>
          ))}
          <g transform={`translate(${BROW_L.x} ${BROW_L.y + by}) rotate(${deg(bt)})`}>
            <Shapes shapes={art.browL} />
          </g>
          <g transform={`translate(${BROW_R.x} ${BROW_R.y + by}) rotate(${deg(-bt)})`}>
            <Shapes shapes={art.browR} />
          </g>
          <Shapes shapes={MOUTHS[mouth]} />
          <Shapes shapes={art.hairFront} />
          <Shapes shapes={art.accessory} />
        </g>
      </g>
    </svg>
  );
}
