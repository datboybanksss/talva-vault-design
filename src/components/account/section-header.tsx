import type { ReactNode } from "react";

export function SectionHeader({
  icon,
  tone,
  title,
  subtitle,
}: {
  icon: ReactNode;
  tone: "teal" | "purple" | "amber" | "blue" | "green";
  title: string;
  subtitle: string;
}) {
  return (
    <div className="tvp-section-header">
      <div
        className={`tvp-kpi-icon tvp-bg-${tone} tvp-section-header-icon`}
        aria-hidden
      >
        {icon}
      </div>
      <div className="tvp-section-header-text">
        <h2 className="tvp-h2 tvp-section-header-title">{title}</h2>
        <div className="tvp-section-header-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}
