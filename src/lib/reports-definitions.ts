/** Versioned product definitions, shared by Reports, dictionary and printable evidence. */
export const REPORTS_DEFINITIONS_VERSION = "v1.0";
export const REPORTS_DEFINITIONS_DATE = "24 Nov 2026";
export const REPORTS_DEFINITIONS = {
  registered: {
    title: "Registered",
    text: "Accepted an invitation and created an account, nothing more. Historical joining dates use accepted invitations or the actual account creation date; no date is invented.",
  },
  onboarded: {
    title: "Onboarded",
    text: "Talent: registered and completed their own validated document upload, not an Admin or agency upload. Once reached, onboarding stays reached after deletion. Agency: registered and any staff member has invited at least one talent. Individual agency staff are counted as registered only. Onboarding rate = onboarded ÷ registered.",
  },
  north_star: {
    title: "Two-sided engagement",
    text: "A live, non-revoked agency–talent relationship is engaged when both sides act in the period. Talent activity is a sign-in or vault action. Agency activity must act on that talent’s relationship, document, invitation or document request; a staff sign-in alone never counts. Inert invitations are excluded. Test scope follows either side of the relationship.",
  },
  sign_ins: {
    title: "Sign-in activity",
    text: "One completed login row is one sign-in. Active users have at least one sign-in in the period; returning users signed in on two or more separate South African calendar days. Days active = distinct SAST days. Sign-ins are recorded from 14 September 2026; 15–24 November 2026 are not recorded. Registered people are the base; administrators are excluded, with agency staff taking priority over talent. Paused and suspended people are included; soft-deleted profiles are excluded.",
  },
  dormant: {
    title: "Dormant users",
    text: "No sign-in for 30 or more days at the selected period end, or today if ongoing. Never-signed-in users count after being registered for 30 days. Missing registration dates or missing sign-ins cannot establish inactivity.",
  },
  retention: {
    title: "Retention",
    text: "Registered people are the base. Active at 30/60/90 days means a sign-in in the preceding 30 days up to that checkpoint after registering. A future checkpoint is Not yet due; missing sign-ins are Not recorded, never zero.",
  },
  funnel: {
    title: "Onboarding funnel",
    text: "Invitation sent → registered → own validated document upload (talent) or first talent invitation (agency) → returned on a second separate sign-in day. Show count, percentage of previous step, percentage of sent, median time from previous step and who stopped. Drafts were never sent; a resend is not another invitation.",
  },
  accounts: {
    title: "Accounts on TalVault",
    text: "Registered talent plus registered agencies, counting each agency as one account. Month-on-month growth uses that base. Business investor figures always use Real accounts.",
  },
  health: {
    title: "Agency health",
    text: "Healthy: at least half of registered talent are active in the period. Needs support: fewer than half are active but staff or talent activity occurred in the last 30 days. Dormant: no staff/talent activity for 30 or more days. New: registered fewer than 30 days ago.",
  },
  trusted_contacts: {
    title: "Trusted-contact visits",
    text: "A visit is each successful access-code entry, not an account sign-in. The denominator is recipients given access. Scope shares/events by the sharing talent’s test flag and filters before deduplicating recipients by email. All counts a recipient once; Real and Test can overlap.",
  },
  time: {
    title: "Time and comparisons",
    text: "South African time (Africa/Johannesburg) throughout; weeks Monday–Sunday. Cut-off is period end or today if ongoing. Expiring soon is within 60 days. The previous comparison has equal length; last-month dates clamp to the last calendar day. All-time comparisons are unavailable.",
  },
  privacy: {
    title: "Raw data and privacy",
    text: "Every raw download follows server-side permissions and selected filters. Emails, including embedded addresses, are omitted unless the admin has permission and explicitly includes them. Documents are metadata only. Fewer than five people is a Small sample. Current agency membership, test flags and statuses are used where historical changes were not recorded.",
  },
} as const;
export type ReportDefinitionKey = keyof typeof REPORTS_DEFINITIONS;
