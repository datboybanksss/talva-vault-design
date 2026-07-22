import { Save } from "lucide-react";

export function AgencyProfilePanel() {
  return (
    <>
      <div className="tvp-topbar">
        <div>
          <h2 className="tvp-h2">Agency profile</h2>
          <div className="tvp-subtitle">Identity, billing details, and messaging defaults.</div>
        </div>
        <div className="tvp-actions">
          <button className="tvp-primary"><Save className="h-4 w-4" />Save changes</button>
        </div>
      </div>

      <div className="tvp-form-layout">
        <div>
          <div className="tvp-card tvp-panel" style={{ marginTop: 0 }}>
            <h2 className="tvp-h2">Agency profile</h2>
            <div className="tvp-form-grid" style={{ marginTop: 14 }}>
              <div className="tvp-form-group"><label>Agency display name</label><input defaultValue="Mbeki Sports Management" /></div>
              <div className="tvp-form-group"><label>Agency type</label><select><option>Sports Agency</option><option>Arts Agency</option><option>Talent Agency</option><option>Mixed Agency</option></select></div>
              <div className="tvp-form-group"><label>Country</label><input defaultValue="South Africa" /></div>
              <div className="tvp-form-group"><label>Primary contact email</label><input defaultValue="ops@mbekisports.co.za" /></div>
            </div>
          </div>

          <div className="tvp-card tvp-panel" style={{ marginTop: 18 }}>
            <h2 className="tvp-h2">Billing details</h2>
            <div className="tvp-form-grid" style={{ marginTop: 14 }}>
              <div className="tvp-form-group"><label>Registered company name</label><input defaultValue="Mbeki Sports Management (Pty) Ltd" /></div>
              <div className="tvp-form-group"><label>VAT / Tax number</label><input defaultValue="4500123456" /></div>
              <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}><label>Billing address</label><input defaultValue="12 Rosebank Avenue, Johannesburg" /></div>
              <div className="tvp-form-group" style={{ gridColumn: "1 / -1" }}><label>Bank / Payment instructions</label><textarea defaultValue="Please use the invoice reference when making payment." /></div>
            </div>
          </div>

          <div className="tvp-card tvp-panel" style={{ marginTop: 18 }}>
            <h2 className="tvp-h2">Quote messaging</h2>
            <div className="tvp-form-group"><label>Default email subject</label><input defaultValue="Quote from Mbeki Sports Management" /></div>
            <div className="tvp-form-group"><label>Default email message</label><textarea defaultValue="Please find attached our quote for your review. Kindly accept within the required quote acceptance period." /></div>
            <div className="tvp-form-group"><label>Quote terms & conditions</label><textarea defaultValue="Quotes are valid only for the acceptance period shown. Work should not commence until the quote has been accepted." /></div>
          </div>

          <div className="tvp-card tvp-panel" style={{ marginTop: 18 }}>
            <h2 className="tvp-h2">Invoice messaging</h2>
            <div className="tvp-form-group"><label>Default email subject</label><input defaultValue="Invoice from Mbeki Sports Management" /></div>
            <div className="tvp-form-group"><label>Default email message</label><textarea defaultValue="Please find attached our invoice. Kindly make payment according to the payment terms shown." /></div>
            <div className="tvp-form-group"><label>Invoice terms & conditions</label><textarea defaultValue="Invoices are due according to the payment rule shown. Partial payment may be accepted only where allowed." /></div>
          </div>
        </div>
      </div>
    </>
  );
}
