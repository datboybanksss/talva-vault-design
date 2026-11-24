import { logTalentSignIn } from "./talent-audit.functions";
import { isMfaEnforced } from "./portal-access";
/** Only actual password-completion handlers call this, never hydration/refresh. */
export async function recordPasswordSignIn() {
  if (await isMfaEnforced()) return;
  await logTalentSignIn().catch(() => {
    console.error("[sign-in metering] recording unavailable after retry");
  });
}
