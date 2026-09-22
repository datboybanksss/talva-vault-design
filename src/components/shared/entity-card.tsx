/**
 * Shared entity card — one pattern for every "person or organisation" tile in
 * the Agency portal (talent roster, Document Vault talent picker, clients).
 *
 * Nothing here is hardcoded: callers pass live data only. The avatar colour is
 * derived deterministically from the name so the same person always keeps the
 * same colour across every screen.
 */
import type { ReactNode } from "react";

const AVATAR_PALETTE = [
  { bg: "var(--avatar-teal)", fg: "var(--avatar-foreground)" },
  { bg: "var(--avatar-purple)", fg: "var(--avatar-foreground)" },
  { bg: "var(--avatar-blue)", fg: "var(--avatar-foreground)" },
  { bg: "var(--avatar-amber)", fg: "var(--avatar-foreground)" },
  { bg: "var(--avatar-green)", fg: "var(--avatar-foreground)" },
  { bg: "var(--avatar-maroon)", fg: "var(--avatar-foreground)" },
];

export function initialsOf(name: string): string {
  const parts = (name ?? "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColours(seed: string) {
  let hash = 0;
  const s = (seed ?? "").toLowerCase();
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function EntityAvatar({
  name,
  seed,
  photoUrl,
  size = "md",
}: {
  name: string;
  seed?: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const colours = avatarColours(seed ?? name);
  const sizeClass =
    size === "sm" ? " tvp-entity-avatar-sm" : size === "lg" ? " tvp-entity-avatar-lg" : "";
  return (
    <span
      className={`tvp-entity-avatar${sizeClass}`}
      style={{ background: colours.bg, color: colours.fg }}
      aria-hidden="true"
    >
      {photoUrl ? <img src={photoUrl} alt="" /> : initialsOf(name)}
    </span>
  );
}

export type EntityStat = {
  label: string;
  value: string | number;
  tone?: "red" | "amber" | "green";
};

export type EntityCardProps = {
  name: string;
  avatarSeed?: string;
  photoUrl?: string | null;
  subtitle?: string | null;
  meta?: string | null;
  pills?: ReactNode;
  stats?: EntityStat[];
  compact?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
  ariaLabel?: string;
};

export function EntityCard({
  name,
  avatarSeed,
  photoUrl,
  subtitle,
  meta,
  pills,
  stats,
  compact,
  onClick,
  actions,
  ariaLabel,
}: EntityCardProps) {
  const className = `tvp-entity-card${compact ? " tvp-entity-card-compact" : ""}`;

  const body = (
    <>
      <div className="tvp-entity-head">
        <EntityAvatar name={name} seed={avatarSeed} photoUrl={photoUrl} size={compact ? "sm" : "md"} />
        <div className="tvp-entity-identity">
          <p className="tvp-entity-name">{name}</p>
          {subtitle ? <p className="tvp-entity-sub">{subtitle}</p> : null}
          {meta ? <p className="tvp-entity-meta">{meta}</p> : null}
        </div>
        {actions ? <div onClick={(e) => e.stopPropagation()}>{actions}</div> : null}
      </div>
      {pills ? <div className="tvp-entity-pills">{pills}</div> : null}
      {stats && stats.length > 0 ? (
        <div className="tvp-entity-stats">
          {stats.map((s) => (
            <div className="tvp-entity-stat" key={s.label}>
              <span
                className={`tvp-entity-stat-value${s.tone ? ` tvp-entity-stat-${s.tone}` : ""}`}
              >
                {s.value}
              </span>
              <span className="tvp-entity-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (!onClick) return <div className={className}>{body}</div>;

  return (
    <button type="button" className={className} onClick={onClick} aria-label={ariaLabel ?? name}>
      {body}
    </button>
  );
}
