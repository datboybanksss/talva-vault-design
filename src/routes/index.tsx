import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  Users,
  User,
  Heart,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TalVault — Secure document vault for talent agencies" },
      {
        name: "description",
        content:
          "TalVault keeps talent documents, agency operations and trusted contacts connected in one secure, role-based workspace.",
      },
      { property: "og:title", content: "TalVault" },
      {
        property: "og:description",
        content:
          "Calm, secure document and operations workspace for agencies, talent and their loved ones.",
      },
    ],
  }),
  component: Landing,
});

const portals = [
  {
    to: "/admin",
    icon: ShieldCheck,
    label: "Admin Portal",
    blurb:
      "Platform operations, agency oversight, invites and aggregate reporting.",
  },
  {
    to: "/agency",
    icon: Building2,
    label: "Talent Manager Portal",
    blurb:
      "Manage your talent roster, Roster Shared Folders, quotes, invoices, clients and AI review.",
  },
  {
    to: "/talent",
    icon: User,
    label: "Talent Portal",
    blurb:
      "Private Vault, Agency Shared Folder, AI Review and personal budget.",
  },
  {
    to: "/loved-one",
    icon: Heart,
    label: "Loved One Portal",
    blurb:
      "Limited, time-bound access to specifically shared documents and updates.",
  },
] as const;

function Landing() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg)" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="flex items-center gap-3 mb-12">
          <div
            className="grid place-items-center rounded-2xl h-12 w-12"
            style={{ background: "var(--teal)", color: "#fff" }}
          >
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[20px] font-black text-ink tracking-tight">
              TalVault
            </div>
            <div className="text-[12px] font-bold uppercase tracking-wider text-muted-fg">
              Secure talent operations
            </div>
          </div>
        </div>

        <div className="max-w-2xl mb-14">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-teal mb-3">
            Portal selector · Demo
          </div>
          <h1 className="text-[40px] md:text-[52px] font-black text-ink leading-[1.05] tracking-tight">
            One vault.
            <br />
            Four trusted roles.
          </h1>
          <p className="text-[16px] text-text-body mt-5 leading-relaxed max-w-xl">
            TalVault keeps sensitive talent documents organised across admin,
            agency, talent and loved-one views — with clear permission
            boundaries and AI suggestions you always confirm.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {portals.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="tv-card p-6 group transition-all hover:-translate-y-0.5"
              style={{ boxShadow: "var(--shadow-tv-soft)" }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="grid place-items-center rounded-2xl h-12 w-12 shrink-0"
                  style={{
                    background: "var(--teal-100)",
                    color: "var(--teal)",
                  }}
                >
                  <p.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[17px] font-black text-ink">
                      {p.label}
                    </div>
                    <ArrowRight
                      className="h-4 w-4 text-muted-fg transition-transform group-hover:translate-x-1 group-hover:text-teal"
                    />
                  </div>
                  <p className="text-[13.5px] text-text-body mt-1.5 leading-relaxed">
                    {p.blurb}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-14 text-[12px] text-muted-fg flex items-center gap-2">
          <Users className="h-3.5 w-3.5" />
          UI demo · mock data · no live accounts
        </div>
      </div>
    </div>
  );
}
