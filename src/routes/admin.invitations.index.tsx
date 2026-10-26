import { searchParam } from "@/lib/search";
import { normaliseAccountScope } from "@/lib/account-filters";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { CombinedInvitationsList } from "@/components/admin/combined-invitations-list";
import { normaliseInvitationStatus, normaliseInvitationType } from "@/lib/invitation-filters";

type InvitationsSearch = {
  type?: string;
  status?: string;
  email?: string;
  accounts?: string;
  q?: string;
};

export const Route = createFileRoute("/admin/invitations/")({
  validateSearch: (raw: Record<string, unknown>): InvitationsSearch => ({
    ...(normaliseInvitationType(raw.type) !== "all" ? { type: String(raw.type) } : {}),
    ...(normaliseInvitationStatus(raw.status) !== "all" ? { status: String(raw.status) } : {}),
    ...(typeof raw.email === "string" && raw.email.trim() ? { email: raw.email.trim() } : {}),
    ...(normaliseAccountScope(raw.accounts, "all") !== "all"
      ? { accounts: String(raw.accounts) }
      : {}),
    ...(searchParam(raw.q) ? { q: searchParam(raw.q) } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Invitations · TalVault Admin" },
      {
        name: "description",
        content: "Agency and talent invitations in one list, with status, expiry and actions.",
      },
      { property: "og:title", content: "Invitations · TalVault Admin" },
      {
        property: "og:description",
        content: "Agency and talent invitations in one list, with status, expiry and actions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitationsPage,
});

function InvitationsPage() {
  const search = Route.useSearch();
  const type = normaliseInvitationType(search.type);
  const status = normaliseInvitationStatus(search.status);
  const nav = useNavigate({ from: "/admin/invitations/" });
  const accounts = normaliseAccountScope(search.accounts, "all");
  const setFilters = (next: { type?: string; status?: string; accounts?: string; q?: string }) =>
    nav({
      search: (prev: InvitationsSearch) => {
        const merged = { ...prev, ...next };
        const out: InvitationsSearch = {};
        if (merged.type && merged.type !== "all") out.type = merged.type;
        if (merged.status && merged.status !== "all") out.status = merged.status;
        if (merged.email) out.email = merged.email;
        if (merged.accounts && merged.accounts !== "all") out.accounts = merged.accounts;
        if (searchParam(merged.q)) out.q = searchParam(merged.q);
        return out;
      },
      replace: true,
    });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h1 className="tvp-h1">Invitations</h1>
          <div className="tvp-subtitle">
            Unique link per recipient. Copy never extends expiry. All actions are audit logged.
          </div>
        </div>
        <div className="tvp-actions" data-tour="admin-invite-actions">
          <Link to="/admin/invitations/new" className="tvp-primary">
            <Send className="h-4 w-4" />
            New invitation
          </Link>
        </div>
      </div>
      <CombinedInvitationsList
        tourId="admin-invite-table"
        type={type}
        status={status}
        email={search.email}
        q={search.q ?? ""}
        accounts={accounts}
        onFilterChange={setFilters}
        onClear={() => nav({ search: {}, replace: true })}
      />
    </>
  );
}
