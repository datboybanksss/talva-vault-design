/**
 * Shared TalVault brand pieces (first used on the Talent dashboard):
 * the header band, coloured icon tiles, accent tints, file-type icons and
 * friendly empty states. Colours come only from existing tokens in
 * src/styles.css (`.tv-band`, `.tv-tile`, `.tv-empty`, `.tv-tint-*`).
 */
import type { ReactNode } from "react";
import { FileImage, FileSpreadsheet, FileText } from "lucide-react";

export type BrandTint = "teal" | "lavender" | "peach" | "green" | "blue";
/** Talent/Trusted contact = warm, Agency = business, Admin = calm. */
export type BandTone = "warm" | "business" | "calm";

export function PageBand({
  title,
  subtitle,
  icon,
  initials,
  meta,
  actions,
  tone = "warm",
  tour,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  initials?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: BandTone;
  tour?: string;
}) {
  return (
    <header className={`tv-band tv-band-${tone}`}>
      <div className="tv-band-who">
        {initials ? (
          <span className="tv-band-avatar" aria-hidden>
            {initials}
          </span>
        ) : icon ? (
          <span className="tv-band-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="tv-band-title">
          <h1 className="tv-band-h1">{title}</h1>
          {subtitle && <p className="tv-band-sub">{subtitle}</p>}
          {meta && <div className="tv-band-meta">{meta}</div>}
        </div>
      </div>
      {actions && (
        <div className="tv-band-actions" data-tour={tour}>
          {actions}
        </div>
      )}
    </header>
  );
}

export function IconTile({
  icon,
  tint = "teal",
  size = "md",
}: {
  icon: ReactNode;
  tint?: BrandTint;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={`tv-icon-tile tv-icon-${tint} tv-icon-${size}`} aria-hidden>
      {icon}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  tint = "teal",
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tint?: BrandTint;
}) {
  return (
    <div className="tv-empty">
      <IconTile icon={icon} tint={tint} size="lg" />
      <strong className="tv-empty-title">{title}</strong>
      {children && <p className="tv-empty-text">{children}</p>}
      {action && <div className="tv-empty-action">{action}</div>}
    </div>
  );
}

/** File-type icon + accent tint (colour is always paired with a distinct shape and label). */
export function fileKind(name: string): { Icon: typeof FileText; tone: string; label: string } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return { Icon: FileText, tone: "amber", label: "PDF" };
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext))
    return { Icon: FileImage, tone: "green", label: "Image" };
  if (["xls", "xlsx", "csv", "numbers"].includes(ext))
    return { Icon: FileSpreadsheet, tone: "blue", label: "Spreadsheet" };
  return { Icon: FileText, tone: "purple", label: "Document" };
}

export function FileTypeIcon({ name }: { name: string }) {
  const k = fileKind(name);
  return (
    <span className={`tvp-review-icon tvp-bg-${k.tone}`} title={k.label}>
      <k.Icon className="h-3.5 w-3.5" aria-label={k.label} />
    </span>
  );
}
