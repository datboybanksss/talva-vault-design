import { createFileRoute } from "@tanstack/react-router";
import { Step1, BrandingPanel, ProgressBar } from "./invite.$token";
import { AGENCY_ACTIVATION_STEP_COUNT } from "@/lib/activation-steps";

export const Route = createFileRoute("/dev/invite-preview")({
  ssr: false,
  component: () => (
    <div className="tv-auth tv-auth--invite">
      <BrandingPanel />
      <section className="tv-auth-panel">
        <div className="tv-auth-card" style={{ maxWidth: 520 }}>
          <ProgressBar step={1} />
          <div className="tv-auth-eyebrow" style={{ marginTop: 4 }}>
            Agency Activation · Step 1 of {AGENCY_ACTIVATION_STEP_COUNT}
          </div>
          <Step1
            invite={{ ok: true, agency_name: "Mbeki Sports", email: "thandi@mbekisports.co.za", kind: "agency_onboarding", contact_person: "Thandi", role: null } as any}
            onContinue={() => {}}
          />
        </div>
      </section>
    </div>
  ),
});
