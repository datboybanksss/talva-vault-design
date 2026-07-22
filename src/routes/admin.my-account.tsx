import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserRound, ShieldCheck } from "lucide-react";
import {
  whoami,
  updateOwnProfile,
  logOwnEmailChangeRequest,
  logOwnPasswordChange,
  logMfaEnrolled,
  logMfaDisabled,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/password";
import { SectionHeader } from "@/components/account/section-header";
import { PasswordCard } from "@/components/account/password-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";

export const Route = createFileRoute("/admin/my-account")({
  head: () => ({ meta: [{ title: "My Account · TalVault Admin" }] }),
  component: MyAccountPage,
});

function MyAccountPage() {
  const whoamiFn = useServerFn(whoami);
  const me = useQuery({ queryKey: ["whoami"], queryFn: () => whoamiFn() });

  const logPwFn = useServerFn(logOwnPasswordChange);
  const logMfaEnrolledFn = useServerFn(logMfaEnrolled);
  const logMfaDisabledFn = useServerFn(logMfaDisabled);

  return (
    <div className="tvp-settings-tight">
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">My Account</h1>
          <div className="tvp-subtitle">
            Your personal admin profile, email and password. Changes only affect
            your own account.
          </div>
        </div>
      </div>

      {me.isLoading && <div className="tvp-card tvp-muted">Loading…</div>}

      {me.data && (
        <div className="tvp-account-grid">
          <div className="tvp-account-full">
            <ProfileCard me={me.data} />
          </div>
          <EmailCard me={me.data} />
          <PasswordCard
            email={me.data.email}
            logPasswordChange={() => logPwFn()}
          />
          <div className="tvp-account-full">
            <TwoFactorCard
              email={me.data.email}
              required={!!me.data.isMainAdmin || me.data.permissionLevel === "edit"}
              logEnrolled={(payload) => logMfaEnrolledFn({ data: payload })}
              logDisabled={() => logMfaDisabledFn()}
              contextLabel="administrator"
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Profile ----------------------------- */

function ProfileCard({ me }: { me: any }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOwnProfile);

  const [firstName, setFirstName] = useState(me.firstName ?? "");
  const [lastName, setLastName] = useState(me.lastName ?? "");
  const [designation, setDesignation] = useState(me.designation ?? "");

  useEffect(() => {
    setFirstName(me.firstName ?? "");
    setLastName(me.lastName ?? "");
    setDesignation(me.designation ?? "");
  }, [me.firstName, me.lastName, me.designation]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          designation: designation.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Profile updated.");
      qc.invalidateQueries({ queryKey: ["whoami"] });
      qc.invalidateQueries({ queryKey: ["admin", "administrators"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update profile"),
  });

  const dirty =
    (firstName || "").trim() !== (me.firstName ?? "") ||
    (lastName || "").trim() !== (me.lastName ?? "") ||
    (designation || "").trim() !== (me.designation ?? "");

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<UserRound className="h-4 w-4" />}
        tone="teal"
        title="Profile"
        subtitle="Your name and role as it appears across the platform."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ marginTop: 8 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="tv-auth-field" style={{ marginTop: 0 }}>
            <label htmlFor="first_name">First name</label>
            <input
              id="first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Israel"
              maxLength={80}
            />
          </div>
          <div className="tv-auth-field" style={{ marginTop: 0 }}>
            <label htmlFor="last_name">Last name</label>
            <input
              id="last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Noko"
              maxLength={80}
            />
          </div>
        </div>

        <div className="tv-auth-field">
          <label htmlFor="designation">Designation / title</label>
          <input
            id="designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="e.g. Platform Operations Lead"
            maxLength={120}
            disabled={!me.isMainAdmin}
            readOnly={!me.isMainAdmin}
          />
          <div className="tv-auth-hint">
            {me.isMainAdmin
              ? "Shown alongside your name in admin surfaces and audit records."
              : "Only the Main Administrator can change your designation. Ask them to update it if needed."}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button
            type="submit"
            className="tvp-primary"
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ Email ------------------------------ */

function EmailCard({ me }: { me: any }) {
  const logEmailFn = useServerFn(logOwnEmailChangeRequest);
  const [email, setEmail] = useState(me.email ?? "");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEmail(me.email ?? ""), [me.email]);

  const dirty = email.trim().toLowerCase() !== (me.email ?? "").toLowerCase();

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!dirty) return;

    setBusy(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        email: email.trim(),
      });
      if (updErr) throw updErr;
      await logEmailFn({ data: { new_email: email.trim() } });
      setInfo(
        "Confirmation email sent to the new address. Click the link there to complete the change — your current email keeps working until you do.",
      );
      toast.success("Email change requested. Check your inbox.");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        tone="purple"
        title="Sign-in email"
        subtitle="Requires confirmation via a link sent to the new address."
      />

      <form onSubmit={request} style={{ marginTop: 8 }} noValidate>
        <div className="tv-auth-field" style={{ marginTop: 0 }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <div className="tv-auth-hint">
            We'll send a confirmation link to the new address. Your current
            email stays active until you click it.
          </div>
        </div>

        {error && <div className="tv-form-alert tv-form-alert-error">{error}</div>}
        {info && <div className="tv-form-alert tv-form-alert-info">{info}</div>}

        <div style={{ marginTop: 10 }}>
          <button
            type="submit"
            className="tvp-primary"
            disabled={!dirty || busy}
          >
            {busy ? "Sending…" : "Request email change"}
          </button>
        </div>
      </form>
    </div>
  );
}
