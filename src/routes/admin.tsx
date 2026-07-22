import { Outlet, Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { supabase } from "@/integrations/supabase/client";

// ⚠️ PRE-LAUNCH CHECKLIST — MUST FLIP BACK TO `true` BEFORE LAUNCH.
// While `false`, high-privilege admins (main + edit) are NOT hard-redirected
// to the 2FA enrollment page; instead a dismissible banner recommends it.
// This is a testing-convenience toggle only. See .lovable/plan.md.
const ENFORCE_ADMIN_2FA = false;

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin · TalVault" },
      {
        name: "description",
        content:
          "Platform operations console — agencies, invites, audit and administrators.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({
        to: "/auth",
        search: { next: location.href },
      });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }

    if (!ENFORCE_ADMIN_2FA) return;

    // 2FA gate: mandatory for main admin and admins with edit rights.
    // View-only admins are not forced to enroll. The enrollment page itself
    // must be reachable, so we skip the gate when already there.
    if (location.pathname === "/admin/enroll-2fa") return;
    const { data: role } = await supabase
      .from("user_roles")
      .select("is_main_admin, permission_level")
      .eq("user_id", userRes.user.id)
      .eq("role", "admin")
      .maybeSingle();
    const twoFaRequired =
      !!role?.is_main_admin || role?.permission_level === "edit";
    if (twoFaRequired) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).find(
        (f) => f.status === "verified",
      );
      if (!verified) {
        throw redirect({ to: "/admin/enroll-2fa" });
      }
    }
  },
  component: AdminLayout,
});

function TwoFactorBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== "undefined" &&
            sessionStorage.getItem("tv-2fa-banner-dismissed") === "1") {
          setDismissed(true);
        }
        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes.user) return;
        const { data: role } = await supabase
          .from("user_roles")
          .select("is_main_admin, permission_level")
          .eq("user_id", userRes.user.id)
          .eq("role", "admin")
          .maybeSingle();
        const required =
          !!role?.is_main_admin || role?.permission_level === "edit";
        if (!required) return;
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = (factors?.totp ?? []).find(
          (f) => f.status === "verified",
        );
        if (!verified) setShow(true);
      } catch {
        /* no-op */
      }
    })();
  }, []);

  if (!show || dismissed) return null;

  return (
    <div
      style={{
        margin: "0 0 16px",
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--tvp-amber-bg)",
        color: "var(--tvp-amber)",
        border: "1px solid var(--tvp-amber-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <ShieldAlert className="h-5 w-5" />
      <div style={{ flex: 1, fontSize: 13 }}>
        <strong>Two-factor authentication required for your role.</strong>{" "}
        2FA is currently unenforced for testing but will be mandatory before launch.
        Please enrol now to avoid a forced setup later.
      </div>
      <Link to="/admin/enroll-2fa" className="tvp-primary" style={{ padding: "6px 10px" }}>
        Enable 2FA
      </Link>
      <button
        className="tvp-mini-btn"
        title="Dismiss for this session"
        onClick={() => {
          try { sessionStorage.setItem("tv-2fa-banner-dismissed", "1"); } catch {}
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}


function AdminLayout() {
  return (
    <AdminShell>
      <TwoFactorBanner />
      <Outlet />
    </AdminShell>
  );
}
