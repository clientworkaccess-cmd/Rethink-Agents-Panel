// SVG rendering of the shared character model, for small avatars, loading and empty states
// (no WebGL context needed). Same proportions, colours and head variant as the Pixi rig in rig.ts.
import { css, lookFor, type Look } from "./model";

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

export default function Critter({ agent, size = 40, mood = "idle", head = false, className = "", title }: Props) {
  const look = lookFor(agent);
  const c = css(look.color);
  const shade = css(look.shade);
  const light = css(look.light);
  const limb = css(look.limb);
  const cheek = css(look.cheek);
  const anim = mood === "busy" ? "critter-busy" : mood === "sleep" ? "" : "critter-bob";
  const viewBox = head ? "-22 -82 44 44" : "-30 -86 60 92";
  const eyesClosed = mood === "sleep";
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
            <ellipse cx="0" cy="2" rx="16" ry="4" fill="#000" opacity="0.1" />
            {/* legs + feet */}
            <rect x="-9" y="-18" width="6" height="15" rx="3" fill={limb} />
            <rect x="3" y="-18" width="6" height="15" rx="3" fill={limb} />
            <ellipse cx="-6.5" cy="-2" rx="5.5" ry="3.2" fill={shade} />
            <ellipse cx="6.5" cy="-2" rx="5.5" ry="3.2" fill={shade} />
            {/* arms */}
            <g>
              <rect x="-20" y="-40" width="6" height="16" rx="3" fill={limb} transform="rotate(12 -17 -38)" />
              <circle cx="-19.5" cy="-24" r="3.8" fill={shade} />
            </g>
            <g className={mood === "wave" ? "critter-wave" : ""}>
              <rect
                x="14"
                y="-40"
                width="6"
                height="16"
                rx="3"
                fill={limb}
                transform={mood === "wave" ? "rotate(-150 17 -38)" : "rotate(-12 17 -38)"}
              />
              <circle cx={mood === "wave" ? 22 : 19.5} cy={mood === "wave" ? -54 : -24} r="3.8" fill={shade} />
            </g>
            {/* body */}
            <ellipse cx="0" cy="-30" rx="15" ry="14" fill={c} />
            <ellipse cx="0" cy="-23" rx="13" ry="6" fill={shade} opacity="0.25" />
            <ellipse cx="-5" cy="-36" rx="5" ry="3" fill={light} opacity="0.6" />
          </>
        )}
        <Top look={look} />
        {/* head */}
        <circle cx="0" cy="-58" r="18" fill={c} />
        <ellipse cx="0" cy="-48" rx="14" ry="6" fill={shade} opacity="0.2" />
        <ellipse cx="-7" cy="-68" rx="6" ry="3.5" fill={light} opacity="0.7" />
        {/* face */}
        {eyesClosed ? (
          <g stroke="#2a1f3d" strokeWidth="1.6" strokeLinecap="round" fill="none">
            <path d="M-10 -59 q3 2.5 6 0" />
            <path d="M4 -59 q3 2.5 6 0" />
          </g>
        ) : (
          <g>
            <g className="critter-eye">
              <ellipse cx="-6.5" cy="-60" rx="4.6" ry="5.4" fill="#fff" />
              <circle cx="-6" cy="-59.5" r="2.6" fill="#2a1f3d" />
              <circle cx="-5" cy="-61" r="0.9" fill="#fff" />
            </g>
            <g className="critter-eye">
              <ellipse cx="6.5" cy="-60" rx="4.6" ry="5.4" fill="#fff" />
              <circle cx="7" cy="-59.5" r="2.6" fill="#2a1f3d" />
              <circle cx="8" cy="-61" r="0.9" fill="#fff" />
            </g>
          </g>
        )}
        <ellipse cx="-11" cy="-52" rx="3" ry="1.8" fill={cheek} opacity="0.7" />
        <ellipse cx="11" cy="-52" rx="3" ry="1.8" fill={cheek} opacity="0.7" />
        {mood === "error" ? (
          <path d="M-3.5 -49 q3.5 -3 7 0" stroke="#2a1f3d" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        ) : mood === "busy" ? (
          <path d="M-3 -50 h6" stroke="#2a1f3d" strokeWidth="1.6" strokeLinecap="round" />
        ) : mood === "sleep" ? (
          <circle cx="0" cy="-50" r="1.6" fill="#2a1f3d" />
        ) : (
          <path
            d={mood === "happy" || mood === "wave" ? "M-4.5 -51 q4.5 5 9 0 z" : "M-3.5 -51 q3.5 3 7 0"}
            stroke="#2a1f3d"
            strokeWidth="1.6"
            fill={mood === "happy" || mood === "wave" ? "#2a1f3d" : "none"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </g>
    </svg>
  );
}

function Top({ look }: { look: Look }) {
  const c = css(look.color);
  const shade = css(look.shade);
  switch (look.variant) {
    case "ears":
      return (
        <g fill={c}>
          <circle cx="-13" cy="-72" r="6" />
          <circle cx="13" cy="-72" r="6" />
          <circle cx="-13" cy="-72" r="3" fill={css(look.cheek)} opacity="0.6" />
          <circle cx="13" cy="-72" r="3" fill={css(look.cheek)} opacity="0.6" />
        </g>
      );
    case "antenna":
      return (
        <g>
          <path d="M0 -75 q2 -6 0 -9" stroke={shade} strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="-85" r="3.4" fill={css(look.cheek)} />
        </g>
      );
    case "sprout":
      return (
        <g>
          <path d="M0 -75 v-5" stroke="#4f9d5d" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="-4" cy="-81" rx="4.5" ry="2.4" fill="#5fbf73" transform="rotate(-25 -4 -81)" />
          <ellipse cx="4" cy="-82" rx="4.5" ry="2.4" fill="#6fd184" transform="rotate(25 4 -82)" />
        </g>
      );
    case "horns":
      return (
        <g fill={shade}>
          <path d="M-12 -70 l-3 -9 l7 5 z" />
          <path d="M12 -70 l3 -9 l-7 5 z" />
        </g>
      );
    default:
      return (
        <g fill={shade}>
          <ellipse cx="-3" cy="-76" rx="3" ry="5" transform="rotate(-20 -3 -76)" />
          <ellipse cx="3" cy="-77" rx="3" ry="5.5" transform="rotate(15 3 -77)" />
        </g>
      );
  }
}
