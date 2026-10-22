import { describe, expect, it } from "vitest";
import {
  missingMergeFields,
  renderAdminInvite,
  standardInviteWording,
  wordingIssues,
} from "./invitation-email";

const agency = {
  agencyName: "NewTech Talent",
  contactPerson: "Maya Johnson",
  adminName: "Lara Prasad",
  recipientEmail: "maya@newtech.co.za",
  expiryDate: "5 November 2026",
  inviteUrl: "https://talvault.com/invite/abc",
};

describe("admin invitation email", () => {
  it("fills every merge field with real values and shows no placeholders", () => {
    const mail = renderAdminInvite("agency", agency, standardInviteWording("agency", agency));
    for (const s of ["Hi Maya,", "NewTech Talent", "Lara Prasad", "5 November 2026", agency.inviteUrl])
      expect(mail.html).toContain(s);
    expect(mail.html + mail.text + mail.subject).not.toMatch(/\{\{|<name>/);
  });

  it("greets the agency team when there is no contact person", () => {
    expect(standardInviteWording("agency", { ...agency, contactPerson: "" }).greeting).toBe(
      "Hello NewTech Talent team,",
    );
  });

  it("reports a missing talent name and inviting admin instead of a placeholder", () => {
    const fields = missingMergeFields("talent", { ...agency, talentName: "", adminName: "" }).map(
      (i) => i.field,
    );
    expect(fields).toEqual(["talent_name", "admin_name"]);
  });

  it("refuses edited wording that still contains a placeholder or is empty", () => {
    expect(wordingIssues({ subject: "Hi {{name}}", greeting: "Hi,", message: "x" })).toHaveLength(1);
    expect(wordingIssues({ subject: "S", greeting: "Hi <name>,", message: "x" })).toHaveLength(1);
    expect(wordingIssues({ subject: "S", greeting: "Hi,", message: " " })).toHaveLength(1);
  });

  it("uses edited wording verbatim and keeps the button, link and expiry locked", () => {
    const w = { subject: "Welcome aboard", greeting: "Dear Maya,", message: "Custom note." };
    const mail = renderAdminInvite("agency", agency, w);
    expect(mail.subject).toBe("Welcome aboard");
    expect(mail.text).toContain("Dear Maya,\n\nCustom note.");
    expect(mail.text).toContain(agency.inviteUrl);
    expect(mail.text).toContain("Expires: 5 November 2026");
  });

  it("the sent email is the preview without the edit markers", () => {
    const w = standardInviteWording("talent", { ...agency, talentName: "Thandi Mokoena" });
    const m = { ...agency, talentName: "Thandi Mokoena" };
    const sent = renderAdminInvite("talent", m, w).html;
    const preview = renderAdminInvite("talent", m, w, { editable: true }).html;
    expect(sent).not.toContain("contenteditable");
    expect(preview).toContain("contenteditable");
    expect(preview.replace(/<[^>]+>/g, "")).toBe(sent.replace(/<[^>]+>/g, ""));
  });
});
