/**
 * Canonical default Private Vault structure.
 * Mirrors the `seed_talent_default_folders` database helper so a talent can
 * restore any deleted top-level category (with its full recommended subfolder
 * set, including the "Other" catch-all) from Settings.
 */

export type DefaultGroup = { name: string; children: string[] };

export type DefaultCategory = {
  name: string;
  icon: string;
  tone: "teal" | "blue" | "green" | "purple" | "amber" | "red";
  sort_order: number;
  /** Flat subfolders (leaf pills directly under the category). */
  children?: string[];
  /** Grouped subfolders (a middle level with its own children). */
  groups?: DefaultGroup[];
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    name: "Personal", icon: "User", tone: "teal", sort_order: 0,
    children: ["ID", "Passport", "Visa", "Driver's License", "Birth Certificate"],
  },
  {
    name: "Dependents", icon: "Baby", tone: "blue", sort_order: 1,
    children: [
      "Birth Certificate", "ID Document", "Vaccine Cards", "School Records",
      "Bursary Records", "Medical Aid Certificate", "Power of Attorney",
    ],
  },
  {
    name: "Health", icon: "HeartPulse", tone: "green", sort_order: 2,
    children: ["Medical Aid Certificate", "Doctor's Referral", "Organ Donor Proof"],
  },
  {
    name: "Insurance", icon: "Shield", tone: "purple", sort_order: 3,
    groups: [
      { name: "Property & Vehicle", children: ["Home Insurance", "Car Insurance"] },
      { name: "Life & Health", children: ["Life Insurance", "Critical Illness & Disability", "Claim Documents"] },
    ],
  },
  {
    name: "Tax", icon: "Landmark", tone: "amber", sort_order: 4,
    groups: [
      { name: "Income & Earnings", children: ["Sponsorship & Endorsement Income", "Prize Money & Appearance Fees", "Royalties & Image Rights"] },
      { name: "Expenses & Deductions", children: ["Expense Receipts", "Travel Logbook", "Training & Equipment Expenses", "Agent/Manager Commission Invoices"] },
      { name: "Compliance & Filing", children: ["Provisional Tax (IRP6)", "Income Tax Return (ITR12)", "Tax Clearance Certificate", "Foreign Income & DTA Records", "SARS Correspondence"] },
    ],
  },
  {
    name: "Pets", icon: "PawPrint", tone: "red", sort_order: 5,
    children: ["Vaccination Records", "Microchip Registration", "Pet Insurance", "Veterinary Records"],
  },
  {
    name: "Assets", icon: "Car", tone: "blue", sort_order: 6,
    children: ["Vehicle Registration", "Vehicle License Disk", "Asset Inventory", "Valuables Certificates"],
  },
  {
    name: "Education", icon: "GraduationCap", tone: "green", sort_order: 7,
    children: ["Enrolment Letter", "Certificate", "Diploma", "Bursary/Scholarship Records", "Coaching/Training Certifications"],
  },
  {
    name: "Estate Planning", icon: "ScrollText", tone: "purple", sort_order: 8,
    children: ["Will", "Power of Attorney", "Trust Documents", "Beneficiary Nominations"],
  },
  {
    name: "Financial", icon: "Wallet", tone: "amber", sort_order: 9,
    children: ["Payslip", "Bank Statement", "Investment Records", "Loan Agreements"],
  },
  {
    name: "Housing", icon: "Home", tone: "teal", sort_order: 10,
    children: ["Lease Agreement", "Utility Bill", "Maintenance Records", "Property Deeds"],
  },
  {
    name: "Legal", icon: "Gavel", tone: "red", sort_order: 11,
    children: ["Affidavits", "NDAs", "Legal Agreements"],
  },
  {
    name: "Warranties", icon: "BadgeCheck", tone: "blue", sort_order: 12,
    children: ["Appliance Receipts", "Warranty Certificates"],
  },
  {
    name: "Work", icon: "Briefcase", tone: "green", sort_order: 13,
    children: ["Employment Contract", "CV", "Skills Development", "Career Achievements & Awards"],
  },
  {
    name: "Vehicle", icon: "Wrench", tone: "purple", sort_order: 14,
    children: ["Service History", "Roadworthy Certificate", "Traffic Fines", "Toll Account"],
  },
  {
    name: "Utilities & Subscriptions", icon: "Plug", tone: "amber", sort_order: 15,
    children: ["Electricity/Water Account", "Internet/Mobile Contract", "Streaming & Subscription Receipts"],
  },
  {
    name: "Memberships", icon: "IdCard", tone: "teal", sort_order: 16,
    children: ["Gym Membership", "Professional Body/Association", "Club Memberships"],
  },
  {
    name: "Travel", icon: "Plane", tone: "red", sort_order: 17,
    children: ["Flight/Travel Itineraries", "Travel Insurance", "Visa Applications"],
  },
  {
    name: "Receipts & Purchases", icon: "ReceiptText", tone: "blue", sort_order: 18,
    children: ["General Purchase Receipts", "Electronics Receipts", "Furniture Receipts"],
  },
];

export function subfolderCount(cat: DefaultCategory) {
  const grouped = (cat.groups ?? []).reduce((n, g) => n + g.children.length, 0);
  return (cat.children?.length ?? 0) + grouped + (cat.groups?.length ?? 0) + 1; // +1 = "Other"
}
