import { useId } from "react";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CountrySelect } from "@/components/shared/country-select";

import {
  getMyAgencyProfile,
  updateMyAgencyProfile,
  updateMyAgencyMainContact,
} from "@/lib/agency.functions";
import { friendlyError } from "@/lib/friendly-error";

export const agencyProfileQO = queryOptions({
  queryKey: ["agency", "my-profile"],
  queryFn: () => getMyAgencyProfile(),
});

export function AgencyProfilePanel() {
  const a11yId = useId();
  const qc = useQueryClient();
  const { data: agency } = useQuery(agencyProfileQO);

  const updateProfileFn = useServerFn(updateMyAgencyProfile);
  const updateContactFn = useServerFn(updateMyAgencyMainContact);

  const [profile, setProfile] = useState({
    name: "",
    business_type: "",
    country: "",
    contact_email: "",
  });
  const [contact, setContact] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    if (!agency) return;
    setProfile({
      name: agency.name ?? "",
      business_type: agency.business_type ?? "",
      country: agency.country ?? "",
      contact_email: agency.contact_email ?? "",
    });
    setContact({
      first_name: agency.main_contact_first_name ?? "",
      last_name: agency.main_contact_last_name ?? "",
      email: agency.main_contact_email ?? "",
      phone: agency.main_contact_phone ?? "",
    });
  }, [agency]);

  const saveProfile = useMutation({
    mutationFn: () => updateProfileFn({ data: profile }),
    onSuccess: () => {
      toast.success("Agency profile saved");
      qc.invalidateQueries({ queryKey: ["agency", "my-profile"] });
    },
    onError: (e) => toast.error(friendlyError(e, "Failed to save")),
  });

  const saveContact = useMutation({
    mutationFn: () => updateContactFn({ data: contact }),
    onSuccess: () => {
      toast.success("Main contact saved");
      qc.invalidateQueries({ queryKey: ["agency", "my-profile"] });
    },
    onError: (e) => toast.error(friendlyError(e, "Failed to save")),
  });

  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h2 className="tvp-h2">Agency profile</h2>
          <div className="tvp-subtitle">Identity and designated main contact.</div>
        </div>
      </div>

      <div className="tvp-form-layout">
        <div>
          <div className="tvp-card tvp-panel" style={{ marginTop: 0 }}>
            <h2 className="tvp-h2">Agency profile</h2>
            <div className="tvp-form-grid" style={{ marginTop: 14 }}>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-0`}>Agency display name</label>
                <input id={`${a11yId}-field-0`}
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-1`}>Agency type</label>
                <select id={`${a11yId}-field-1`}
                  value={profile.business_type}
                  onChange={(e) => setProfile((p) => ({ ...p, business_type: e.target.value }))}
                >
                  <option value="">Select…</option>
                  <option value="Sports Agency">Sports Agency</option>
                  <option value="Arts Agency">Arts Agency</option>
                  <option value="Talent Agency">Talent Agency</option>
                  <option value="Mixed Agency">Mixed Agency</option>
                </select>
              </div>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-2`}>Country</label>
                <CountrySelect id={`${a11yId}-field-2`}
                  value={profile.country}
                  onChange={(country) => setProfile((p) => ({ ...p, country }))}
                />
              </div>

              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-3`}>Primary contact email</label>
                <input id={`${a11yId}-field-3`}
                  type="email"
                  value={profile.contact_email}
                  onChange={(e) => setProfile((p) => ({ ...p, contact_email: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                className="tvp-primary"
                onClick={() => saveProfile.mutate()}
                disabled={saveProfile.isPending}
              >
                <Save className="h-4 w-4" />
                {saveProfile.isPending ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>

          <div className="tvp-card tvp-panel" style={{ marginTop: 18 }}>
            <h2 className="tvp-h2">Main Contact Person</h2>
            <div className="tvp-subtitle" style={{ marginTop: 4 }}>
              The agency's designated contact for compliance and communication.
            </div>
            <div className="tvp-form-grid" style={{ marginTop: 14 }}>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-4`}>First name</label>
                <input id={`${a11yId}-field-4`}
                  value={contact.first_name}
                  onChange={(e) => setContact((c) => ({ ...c, first_name: e.target.value }))}
                />
              </div>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-5`}>Last name</label>
                <input id={`${a11yId}-field-5`}
                  value={contact.last_name}
                  onChange={(e) => setContact((c) => ({ ...c, last_name: e.target.value }))}
                />
              </div>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-6`}>Email</label>
                <input id={`${a11yId}-field-6`}
                  type="email"
                  value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                />
              </div>
              <div className="tvp-form-group">
                <label htmlFor={`${a11yId}-field-7`}>Contact number</label>
                <input id={`${a11yId}-field-7`}
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                className="tvp-primary"
                onClick={() => saveContact.mutate()}
                disabled={saveContact.isPending}
              >
                <Save className="h-4 w-4" />
                {saveContact.isPending ? "Saving…" : "Save main contact"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
