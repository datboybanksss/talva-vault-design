import { describe, expect, it } from "vitest";
import {
  addMonths,
  invitationFunnel,
  launchOffer,
  launchProgress,
  parseLaunchSettings,
  sastRange,
  termsOutstanding,
  toCsv,
  type InviteRow,
  type LaunchSettings,
} from "./launch-reporting-core";

const S: LaunchSettings = {
  launch_date: "2026-11-17",
  window_months: 3,
  talent_target: 100,
  agency_target: 5,
  offer_free_months: 6,
  offer_talent_places: 100,
  offer_agency_places: 5,
};
const NOW = "2026-12-01T10:00:00.000Z";
const inv = (o: Partial<InviteRow>): InviteRow => ({
  id: Math.random().toString(36).slice(2),
  type: "talent",
  segment: "independent",
  status: "pending",
  email: "a@x.com",
  created_at: "2026-11-20T08:00:00.000Z",
  expires_at: "2026-12-30T00:00:00.000Z",
  first_sent_at: "2026-11-20T08:00:00.000Z",
  accepted_at: null,
  source: "admin",
  ...o,
});
const ALL = {
  ...sastRange("2026-11-01", "2026-12-31"),
  type: "all" as const,
  segment: "all" as const,
};

describe("launch settings", () => {
  it("accepts the stored launch values and rejects bad ones", () => {
    expect(parseLaunchSettings(S)).toEqual(S);
    expect(parseLaunchSettings({ ...S, talent_target: -1 })).toBeNull();
    expect(parseLaunchSettings({ ...S, launch_date: "17/11/2026" })).toBeNull();
  });
});

describe("SAST date boundaries", () => {
  it("a SAST day runs 22:00 UTC to 21:59:59.999 UTC", () => {
    expect(sastRange("2026-11-17", "2026-11-17")).toEqual({
      fromIso: "2026-11-16T22:00:00.000Z",
      toIso: "2026-11-17T21:59:59.999Z",
    });
  });
  it("counts talent who joined just after SAST midnight on launch day, not just before", () => {
    const p = launchProgress(
      {
        talentJoined: ["2026-11-16T21:59:59.999Z", "2026-11-16T22:00:00.000Z", null],
        agenciesJoined: [],
      },
      S,
    );
    expect(p.talent).toBe(1);
    expect(p.talentPct).toBe(1);
  });
  it("the 3-month window ends exclusive at 17 Feb 2027 SAST", () => {
    const p = launchProgress(
      {
        talentJoined: [],
        agenciesJoined: ["2027-02-16T21:59:59.000Z", "2027-02-16T22:00:00.000Z"],
      },
      S,
    );
    expect(p.agencies).toBe(1);
    expect(p.agencyPct).toBe(20);
  });
  it("adding months clamps month ends", () => {
    expect(addMonths("2027-01-31T10:00:00.000Z", 1)).toBe("2027-02-28T10:00:00.000Z");
  });
});

describe("invitation conversion", () => {
  it("excludes drafts from sent and counts expired and revoked separately", () => {
    const f = invitationFunnel(
      [
        inv({ status: "draft", first_sent_at: null }),
        inv({ status: "pending" }),
        inv({ status: "pending", expires_at: "2026-11-25T00:00:00.000Z" }),
        inv({ status: "revoked" }),
        inv({ status: "accepted", accepted_at: "2026-11-21T08:00:00.000Z" }),
      ],
      ALL,
      NOW,
    );
    expect(f.counts).toMatchObject({ draft: 1, pending: 1, expired: 1, revoked: 1, accepted: 1 });
    expect(f.sent).toBe(4);
    expect(f.acceptanceRate).toBe(25);
    expect(f.medianHoursToAccept).toBe(24);
  });
  it("a resent invitation is one invitation", () => {
    const f = invitationFunnel([inv({ status: "pending" })], ALL, NOW);
    expect(f.sent).toBe(1);
  });
  it("duplicate emails on separate invitations are separate invitations", () => {
    const f = invitationFunnel(
      [inv({ email: "a@x.com", status: "revoked" }), inv({ email: "a@x.com" })],
      ALL,
      NOW,
    );
    expect(f.total).toBe(2);
  });
  it("accepted without a recorded send time is not guessed into the median", () => {
    const f = invitationFunnel(
      [inv({ status: "accepted", first_sent_at: null, accepted_at: NOW, source: null })],
      ALL,
      NOW,
    );
    expect(f.medianHoursToAccept).toBeNull();
    expect(f.acceptedWithoutSendTime).toBe(1);
    expect(f.bySource.not_recorded!.accepted).toBe(1);
  });
  it("filters by type and talent segment", () => {
    const rows = [
      inv({ type: "agency", segment: null }),
      inv({ segment: "agency_linked", source: "agency" }),
      inv({}),
    ];
    expect(invitationFunnel(rows, { ...ALL, type: "agency" }, NOW).total).toBe(1);
    expect(
      invitationFunnel(rows, { ...ALL, type: "talent", segment: "independent" }, NOW).total,
    ).toBe(1);
    expect(invitationFunnel(rows, ALL, NOW).bySource.agency!.pending).toBe(1);
  });
  it("date range uses SAST midnight", () => {
    const r = sastRange("2026-11-20", "2026-11-20");
    const rows = [
      inv({ created_at: "2026-11-19T21:59:59.999Z" }),
      inv({ created_at: "2026-11-19T22:00:00.000Z" }),
    ];
    expect(invitationFunnel(rows, { ...r, type: "all", segment: "all" }, NOW).total).toBe(1);
  });
  it("empty data gives zeros and no rate", () => {
    const f = invitationFunnel([], ALL, NOW);
    expect(f.total).toBe(0);
    expect(f.acceptanceRate).toBeNull();
  });
});

describe("launch offer", () => {
  it("gives places in send order from launch, ignores earlier sends, free period from acceptance", () => {
    const s = { ...S, offer_agency_places: 2 };
    const o = launchOffer(
      [
        {
          id: "pre",
          type: "agency",
          name: "Pre",
          email: "",
          first_sent_at: "2026-11-10T00:00:00.000Z",
          accepted_at: "2026-11-11T00:00:00.000Z",
          status: "accepted",
        },
        {
          id: "b",
          type: "agency",
          name: "B",
          email: "",
          first_sent_at: "2026-11-18T00:00:00.000Z",
          accepted_at: null,
          status: "pending",
        },
        {
          id: "a",
          type: "agency",
          name: "A",
          email: "",
          first_sent_at: "2026-11-17T09:00:00.000Z",
          accepted_at: "2026-11-20T00:00:00.000Z",
          status: "accepted",
        },
        {
          id: "c",
          type: "agency",
          name: "C",
          email: "",
          first_sent_at: "2026-11-19T00:00:00.000Z",
          accepted_at: "2026-11-19T00:00:00.000Z",
          status: "accepted",
        },
      ],
      s,
    );
    expect(o.agency.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(o.agency.used).toBe(1);
    expect(o.agency.rows[0]!.freeUntil).toBe("2027-05-20T00:00:00.000Z");
  });
});

describe("terms outstanding", () => {
  const current = [{ id: "t2", doc_type: "talent", version: "v1.2" }];
  it("someone who accepted only an older version is outstanding, with their last version shown", () => {
    const out = termsOutstanding(
      [{ user_id: "u1", name: "U", email: "", docType: "talent", segment: "independent" }],
      [
        {
          id: "1",
          user_id: "u1",
          document_id: "t1",
          doc_type: "talent",
          version: "v1.1",
          accepted_at: NOW,
          body_sha256: "h",
          hash_retrospective: false,
        },
      ],
      current,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.lastAcceptedVersion).toBe("v1.1");
  });
  it("accepting the current document clears them; switching to agency-linked does not matter", () => {
    const out = termsOutstanding(
      [{ user_id: "u1", name: "U", email: "", docType: "talent", segment: "agency_linked" }],
      [
        {
          id: "1",
          user_id: "u1",
          document_id: "t2",
          doc_type: "talent",
          version: "v1.2",
          accepted_at: NOW,
          body_sha256: "h",
          hash_retrospective: false,
        },
      ],
      current,
    );
    expect(out).toHaveLength(0);
  });
});

describe("CSV", () => {
  it("quotes commas and quotes", () => {
    expect(toCsv([["a,b", 'say "hi"', null, 3]])).toBe('"a,b","say ""hi""",,3');
  });
});

describe("test accounts and launch offer places", () => {
  it("never gives a test account a launch offer place", async () => {
    const { launchOffer: offer } = await import("./launch-reporting-core");
    const c = (id: string, sent: string, is_test: boolean) => ({
      id,
      type: "agency" as const,
      name: id,
      email: `${id}@x.com`,
      first_sent_at: sent,
      accepted_at: sent,
      status: "accepted",
      is_test,
    });
    const r = offer(
      [c("test1", "2026-11-17T08:00:00Z", true), c("real1", "2026-11-18T08:00:00Z", false)],
      { ...S, offer_agency_places: 1 },
    );
    expect(r.agency.rows.map((x) => x.id)).toEqual(["real1"]);
    expect(r.agency.used).toBe(1);
  });
  it("does not count sign-ups before the launch date", async () => {
    const { inLaunchWindow } = await import("./launch-reporting-core");
    const s = { ...S, launch_date: "2026-11-17", window_months: 3 };
    expect(inLaunchWindow("2026-11-16T21:59:59.999Z", s)).toBe(false); // 23:59 SAST 16 Nov
    expect(inLaunchWindow("2026-11-16T22:00:00.000Z", s)).toBe(true); // 00:00 SAST 17 Nov
  });
});
