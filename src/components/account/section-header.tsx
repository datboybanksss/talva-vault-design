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
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        className={`tvp-kpi-icon tvp-bg-${tone}`}
        style={{ width: 36, height: 36 }}
      >
        {icon}
      </div>
      <div>
        <h2 className="tvp-h2" style={{ margin: 0 }}>{title}</h2>
        <div className="tvp-muted" style={{ fontSize: 12 }}>{subtitle}</div>
      </div>
    </div>
  );
}
