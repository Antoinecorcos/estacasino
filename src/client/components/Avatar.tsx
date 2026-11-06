import { useId } from "react";
import { type ConfigAvatar, couleurPiece } from "../../shared/avatar";

// Avatar illustré en SVG, assemblé à partir de pièces : fond, cheveux (arrière et avant),
// cou, tenue, visage et accessoire. Toutes les formes sont dessinées dans un carré de 120 × 120.

const LAITON = "#C9A45C";

function nuancer(hexa: string, f: number): string {
  const n = parseInt(hexa.slice(1), 16);
  const canal = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  const [r, g, b] = [canal((n >> 16) & 255), canal((n >> 8) & 255), canal(n & 255)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function CheveuxArriere({ style, c }: { style: string; c: string }) {
  switch (style) {
    case "carre":
      return <path d="M37 50 C35 30 47 21 60 21 C73 21 85 30 83 50 L84 74 C79 77 74 76 72 72 L72 52 L48 52 L48 72 C46 76 41 77 36 74 Z" fill={c} />;
    case "long":
    case "frange":
      return <path d="M37 50 C35 28 47 20 60 20 C73 20 85 28 83 50 C84 70 88 90 92 104 C84 110 74 106 72 100 L72 56 L48 56 L48 100 C46 106 36 110 28 104 C32 90 36 70 37 50 Z" fill={c} />;
    case "ondule":
      return <path d="M37 50 C35 30 47 21 60 21 C73 21 85 30 83 50 L83 68 C79 71 75 70 73 67 L72 52 L48 52 L47 67 C45 70 41 71 37 68 Z" fill={c} />;
    case "chignon":
      return (
        <g>
          <circle cx="60" cy="22" r="10" fill={c} />
          <path d="M54 17 Q60 13 66 17" stroke={nuancer(c, 0.2)} strokeWidth="1.2" fill="none" />
        </g>
      );
    case "boucles":
      return (
        <g fill={c}>
          <circle cx="40" cy="56" r="6" />
          <circle cx="80" cy="56" r="6" />
        </g>
      );
    default:
      return null;
  }
}

function CheveuxAvant({ style, c }: { style: string; c: string }) {
  const reflet = nuancer(c, 0.22);
  switch (style) {
    case "court":
      return <path d="M41 50 C39 34 48 25 61 25 C73 25 81 33 79 50 C77 43 74 38 68 36 C62 39 52 39 46 38 C43 41 42 45 41 50 Z" fill={c} />;
    case "rase":
      return <path d="M42 46 C42 33 50 27 60 27 C70 27 78 33 78 46 C74 39 67 35 60 35 C53 35 46 39 42 46 Z" fill={c} opacity="0.8" />;
    case "carre":
      return <path d="M40 50 C39 33 48 25 60 25 C72 25 81 33 80 50 C76 42 70 39 63 39 C57 39 50 40 46 43 C43 45 41 47 40 50 Z" fill={c} />;
    case "long":
      return <path d="M40 52 C39 32 50 24 61 24 C73 24 81 33 80 52 C76 40 66 34 58 36 C50 38 44 44 40 52 Z" fill={c} />;
    case "chignon":
      return <path d="M41 49 C40 33 49 26 60 26 C71 26 80 33 79 49 C76 41 69 36 60 36 C51 36 44 41 41 49 Z" fill={c} />;
    case "boucles":
      return (
        <g fill={c}>
          {[
            [43, 44, 5.5], [44, 36, 6], [49, 30, 6.5], [56, 26, 7], [64, 26, 7], [71, 29, 6.5], [76, 35, 6], [77, 43, 5.5],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
          <circle cx="55" cy="25" r="2" fill={reflet} opacity="0.6" />
          <circle cx="70" cy="28" r="1.6" fill={reflet} opacity="0.6" />
        </g>
      );
    case "gomina":
      return (
        <g>
          <path d="M41 47 C40 31 51 23 63 24 C75 25 81 33 79 47 C76 38 70 33 61 33 C53 33 46 38 41 47 Z" fill={c} />
          <path d="M48 31 C55 27 66 27 74 32" stroke={reflet} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M45 37 C53 32 66 31 76 37" stroke={reflet} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    case "ondule":
      return (
        <g>
          <path d="M40 52 C38 34 48 24 60 24 C72 24 82 34 80 52 C78 46 74 44 71 46 C68 40 63 38 59 41 C55 37 49 38 47 43 C44 42 41 46 40 52 Z" fill={c} />
          <path d="M46 34 C50 30 54 34 58 30 C62 26 66 31 70 28" stroke={reflet} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </g>
      );
    case "raie":
      return (
        <g>
          <path d="M41 48 C40 32 48 25 58 25 C71 25 80 32 79 48 C77 41 72 36 65 35 L63 33 C57 37 47 39 41 48 Z" fill={c} />
          <path d="M63 26 L63 33" stroke={nuancer(c, -0.35)} strokeWidth="1" />
          <path d="M66 29 C71 30 75 34 77 39" stroke={reflet} strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </g>
      );
    case "frange":
      return (
        <g>
          <path d="M40 48 C39 31 49 23 60 23 C71 23 81 31 80 48 L78 44 L42 44 Z" fill={c} />
          <path d="M47 30 C53 26 63 25 72 29" stroke={reflet} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

const BUSTE = "M14 120 C16 98 32 88 50 86 L70 86 C88 88 104 98 106 120 Z";

function Tenue({ id, peau }: { id: string; peau: string }) {
  switch (id) {
    case "chemise":
      return (
        <g>
          <path d={BUSTE} fill="#E9E3D6" />
          <path d="M52 86 L60 101 L68 86 Z" fill={peau} />
          <path d="M50 84 L60 99 L45 95 Z" fill="#F7F2E8" stroke="#CFC7B8" strokeWidth="0.6" />
          <path d="M70 84 L60 99 L75 95 Z" fill="#F7F2E8" stroke="#CFC7B8" strokeWidth="0.6" />
          <path d="M60 101 L60 120" stroke="#CFC7B8" strokeWidth="0.7" />
        </g>
      );
    case "smoking":
      return (
        <g>
          <path d={BUSTE} fill="#0E0F10" />
          <path d="M50 86 L60 114 L70 86 Z" fill="#F2EDE4" />
          <path d="M50 86 L60 114 L41 100 L44 90 Z" fill="#23272A" />
          <path d="M70 86 L60 114 L79 100 L76 90 Z" fill="#23272A" />
          <path d="M52 86 L60 90 L52 94 Z M68 86 L60 90 L68 94 Z" fill={LAITON} />
          <rect x="57.6" y="87.6" width="4.8" height="4.8" rx="1.4" fill="#A9853F" />
          <circle cx="60" cy="102" r="0.9" fill="#0E0F10" />
          <circle cx="60" cy="108" r="0.9" fill="#0E0F10" />
        </g>
      );
    case "robe_soiree":
      return (
        <g>
          <path d={BUSTE} fill={peau} />
          <path d="M22 120 C26 104 36 99 45 100 Q60 109 75 100 C84 99 94 104 98 120 Z" fill="#5B1726" />
          <path d="M45 100 Q60 109 75 100" stroke="#7A2436" strokeWidth="1.2" fill="none" />
          <path d="M50 86 Q60 95 70 86" stroke={LAITON} strokeWidth="1.1" fill="none" />
          <circle cx="60" cy="93.5" r="1.6" fill={LAITON} />
        </g>
      );
    case "gilet_croupier":
      return (
        <g>
          <path d={BUSTE} fill="#EEE8DC" />
          <path d="M30 120 C32 104 40 94 52 88 L60 108 L60 120 Z" fill="#0F3D31" />
          <path d="M90 120 C88 104 80 94 68 88 L60 108 L60 120 Z" fill="#0F3D31" />
          <circle cx="60" cy="112" r="1.3" fill={LAITON} />
          <circle cx="60" cy="118" r="1.3" fill={LAITON} />
          <path d="M53 86 L60 89.5 L53 93 Z M67 86 L60 89.5 L67 93 Z" fill="#111" />
          <rect x="58" y="87.5" width="4" height="4" rx="1.2" fill="#000" />
        </g>
      );
    case "veste_velours":
      return (
        <g>
          <path d={BUSTE} fill="#4A1622" />
          <path d="M50 86 L60 106 L70 86 Z" fill="#15181A" />
          <path d="M50 86 L60 106 L43 99 L45 90 Z" fill="#3A0F19" />
          <path d="M70 86 L60 106 L77 99 L75 90 Z" fill="#3A0F19" />
          <path d="M84 104 L92 104" stroke={LAITON} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      );
    default: // col roulé
      return (
        <g>
          <path d={BUSTE} fill="#23282B" />
          <path d="M48 79 Q60 85 72 79 L72 90 Q60 96 48 90 Z" fill="#2E3438" />
          <path d="M50 84 Q60 89 70 84" stroke="#3A4146" strokeWidth="0.8" fill="none" />
        </g>
      );
  }
}

function pointsCollier(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = (1 - t) ** 2 * 47 + 2 * (1 - t) * t * 60 + t ** 2 * 73;
    const y = (1 - t) ** 2 * 84 + 2 * (1 - t) * t * 96 + t ** 2 * 84;
    pts.push([x, y]);
  }
  return pts;
}

function Accessoire({ id }: { id: string }) {
  switch (id) {
    case "lunettes_rondes":
      return (
        <g stroke="#1A1A1A" strokeWidth="1.3" fill="rgba(255,255,255,0.08)">
          <circle cx="52.5" cy="53" r="5" />
          <circle cx="67.5" cy="53" r="5" />
          <path d="M57.5 52.5 Q60 51 62.5 52.5 M47.5 52 L42 50.5 M72.5 52 L78 50.5" fill="none" />
        </g>
      );
    case "lunettes_nuit":
      return (
        <g>
          <rect x="46" y="49" width="12" height="8" rx="3" fill="#0B0D0E" stroke={LAITON} strokeWidth="0.9" />
          <rect x="62" y="49" width="12" height="8" rx="3" fill="#0B0D0E" stroke={LAITON} strokeWidth="0.9" />
          <path d="M58 52 L62 52 M46 51 L42 50 M74 51 L78 50" stroke={LAITON} strokeWidth="0.9" />
          <path d="M48 51.5 L51.5 51.5 M64 51.5 L67.5 51.5" stroke="#fff" strokeWidth="0.8" opacity="0.4" strokeLinecap="round" />
        </g>
      );
    case "noeud_papillon":
      return (
        <g>
          <path d="M50 83 L60 88 L50 93 Z M70 83 L60 88 L70 93 Z" fill="#15181A" />
          <rect x="57" y="85.5" width="6" height="5" rx="1.5" fill="#0B0D0E" />
        </g>
      );
    case "fedora":
      return (
        <g>
          <path d="M44 33 C43 18 48 12 60 12 C72 12 77 18 76 33 Z" fill="#1C2023" />
          <path d="M55 14 Q60 18 65 14" stroke="#0B0D0E" strokeWidth="1.2" fill="none" />
          <rect x="44" y="26.5" width="32" height="5" fill={LAITON} />
          <ellipse cx="60" cy="33" rx="29" ry="5.5" fill="#15181A" />
          <path d="M33 32 Q60 28 87 32" stroke="#2A2F33" strokeWidth="0.8" fill="none" />
        </g>
      );
    case "monocle":
      return (
        <g>
          <circle cx="67.5" cy="53" r="6" stroke={LAITON} strokeWidth="1.5" fill="rgba(255,255,255,0.12)" />
          <path d="M72.5 57 Q79 72 70 86" stroke={LAITON} strokeWidth="0.8" fill="none" />
        </g>
      );
    case "collier_perles":
      return (
        <g>
          {pointsCollier().map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="1.9" fill="#F4EEE2" stroke="#D3C9B6" strokeWidth="0.4" />
          ))}
        </g>
      );
    case "casquette":
      return (
        <g>
          <path d="M40 40 C40 26 50 20 62 20 C74 20 82 28 81 38 C70 35 52 35 40 40 Z" fill="#6B5843" />
          <path d="M38 40 Q60 31 82 38 Q80 44 60 43 Q42 44 38 40 Z" fill="#574634" />
          <path d="M47 27 L49 33 M55 23 L56 30 M64 22 L64 29 M72 25 L71 31" stroke="#7D6950" strokeWidth="0.8" />
          <circle cx="61" cy="20.5" r="1.7" fill="#574634" />
        </g>
      );
    case "creoles":
      return (
        <g stroke={LAITON} strokeWidth="1.4" fill="none">
          <circle cx="41" cy="61" r="3.3" />
          <circle cx="79" cy="61" r="3.3" />
        </g>
      );
    default:
      return null;
  }
}

export function Avatar({ config, taille = 72, titre }: { config: ConfigAvatar; taille?: number; titre?: string }) {
  const uid = useId().replace(/:/g, "");
  const peau = couleurPiece("peau", config.peau, "#E8BF9A");
  const cheveux = couleurPiece("couleurCheveux", config.couleurCheveux, "#3B2A20");
  const fond = couleurPiece("fond", config.fond, "#1E2326");
  const ombre = nuancer(peau, -0.18);
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 120 120"
      role={titre ? "img" : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
      className="avatar"
    >
      <defs>
        <clipPath id={`rond-${uid}`}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
        <radialGradient id={`lum-${uid}`} cx="0.3" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#rond-${uid})`}>
        <rect width="120" height="120" fill={fond} />
        <rect width="120" height="120" fill={`url(#lum-${uid})`} />
        <CheveuxArriere style={config.cheveux} c={cheveux} />
        <path d="M50 64 L50 86 Q60 92 70 86 L70 64 Z" fill={peau} />
        <path d="M50 70 Q60 79 70 70 L70 75 Q60 83 50 75 Z" fill={ombre} opacity="0.55" />
        <Tenue id={config.tenue} peau={peau} />
        <ellipse cx="41.5" cy="54" rx="3.8" ry="5.5" fill={ombre} />
        <ellipse cx="78.5" cy="54" rx="3.8" ry="5.5" fill={ombre} />
        <ellipse cx="60" cy="50" rx="18.5" ry="22" fill={peau} />
        <circle cx="49" cy="60" r="3.2" fill="#E07A6A" opacity="0.16" />
        <circle cx="71" cy="60" r="3.2" fill="#E07A6A" opacity="0.16" />
        <ellipse cx="52.5" cy="53" rx="2" ry="2.4" fill="#1A1412" />
        <ellipse cx="67.5" cy="53" rx="2" ry="2.4" fill="#1A1412" />
        <circle cx="53.1" cy="52.2" r="0.6" fill="#fff" />
        <circle cx="68.1" cy="52.2" r="0.6" fill="#fff" />
        <path d="M48.5 47.5 Q52.5 45.5 56 47 M64 47 Q67.5 45.5 71.5 47.5" stroke={cheveux} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M60 54 Q58.4 60 60.6 61" stroke={ombre} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M55 65.5 Q60 68.5 65 65.5" stroke="#7A3B2E" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <CheveuxAvant style={config.cheveux} c={cheveux} />
        <Accessoire id={config.accessoire} />
      </g>
    </svg>
  );
}
