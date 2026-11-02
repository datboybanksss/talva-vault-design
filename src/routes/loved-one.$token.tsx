import { SHARE_RECIPIENT_TERM, SHARE_RECIPIENT_TERM_CAPITALISED } from "@/lib/terms";
import { TalVaultLockup } from "@/components/brand/talvault-logo";
import { ModalShell } from "@/components/shared/modal-shell";
import { DocumentModal } from "@/components/shared/document-modal";
import { fileKind } from "@/components/shared/brand";
import { fmtDate, fmtDateTime } from "@/lib/display-dates";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Clock,
  Download,
  Folder,
  FileText,
  Lock,
  Eye,
  KeyRound,
  X,
  Hourglass,
  Ban,
  SearchX,
  ShieldAlert,
  FileWarning,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getLovedOneShareByToken,
  getLovedOneFileUrl,
  unlockLovedOneShare,
} from "@/lib/loved-one.functions";
import {
  BillingDocument,
  type BillingDocAgency,
  type BillingDocRecord,
} from "@/components/agency/billing-document";
import type { BillingLine } from "@/lib/billing";
import { friendlyError } from "@/lib/friendly-error";

/** A shared quote or invoice, as returned for a billing share. */
type SharedBilling = { doc: SharedBillingDoc; lines: BillingLine[]; agency: BillingDocAgency };
/** A shared document's listing fields, as returned by the share loader. */
type SharedDoc = {
  id: string;
  name: string;
  folder_id: string | null;
  size_bytes: number | null;
  mime_type?: string | null;
  created_at: string;
};
type SharedFolder = { id: string; name: string };
type SharedBillingDoc = BillingDocRecord & { id: string };
/** What the page reads from each getLovedOneShareByToken outcome. */
type ShareState =
  | { status: "loading" }
  | { status: "error"; error?: string }
  | { status: "not_found" }
  | { status: "expired"; sharer?: { full_name: string } | null }
  | { status: "revoked"; sharer?: { full_name: string } | null }
  | { status: "locked"; sharer?: { full_name: string } | null }
  | {
      status: "code_required";
      sharer?: { full_name: string } | null;
      share?: { loved_one_name: string | null };
    }
  | {
      status: "ok";
      sharer: { full_name: string };
      share: {
        loved_one_name: string | null;
        loved_one_email: string | null;
        expires_at: string;
        note: string | null;
        permission: "view" | "download";
        share_kind: "folders" | "document" | "billing";
      };
      folders: SharedFolder[];
      documents: SharedDoc[];
      billing: SharedBilling[];
    };

/** Read-only rendering of a shared quote or invoice — data, not a file. */
function BillingBlock({
  record,
  watermarked,
  watermark,
}: {
  record: SharedBilling;
  watermarked: boolean;
  watermark: string;
}) {
  const tiles = Array.from({ length: 18 });
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        marginBottom: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ position: "relative" }}>
        <BillingDocument doc={record.doc} lines={record.lines} agency={record.agency} />
        {watermarked && (
          <div
            data-testid="lo-billing-watermark"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "hidden",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              alignContent: "space-around",
              gap: 12,
            }}
          >
            {tiles.map((_, i) => (
              <span
                key={i}
                style={{
                  transform: "rotate(-28deg)",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "color-mix(in oklab, var(--teal) 18%, transparent)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {watermark}
              </span>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--line)",
          fontSize: 12,
          color: "var(--ink-500)",
        }}
      >
        {watermarked
          ? "View only. Watermarked with your email and the time you opened it."
          : "Shared with you for your records."}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/loved-one/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${SHARE_RECIPIENT_TERM_CAPITALISED} access · TalVault` },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: `${SHARE_RECIPIENT_TERM_CAPITALISED} access · TalVault` },
      {
        property: "og:description",
        content: `Secure, time-limited access to documents shared with you as a ${SHARE_RECIPIENT_TERM} via TalVault.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: `Secure, time-limited access to documents shared with you as a ${SHARE_RECIPIENT_TERM} via TalVault.`,
      },
    ],
  }),
  component: LovedOnePage,
});

