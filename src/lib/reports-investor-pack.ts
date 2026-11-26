import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import lockup from "@/assets/talvault-lockup-teal.png.asset.json";
import { SIGN_IN_HISTORY_NOTE, channelLabel } from "./reports-analytics";
import { fmtDate } from "./display-dates";

type FigureRow = { label: string; value: string; context: string };
export type InvestorPack = {
  generated_at: string;
  from: string;
  to: string;
  launch: {
    settings: { launch_date: string; talent_target: number; agency_target: number } | null;
    end: string | null;
    projection: number | null;
  };
  business: FigureRow[];
  launch_progress: FigureRow[];
  network: FigureRow[];
  adoption: FigureRow[];
  trust: FigureRow[];
  quality: FigureRow[];
  agencies: FigureRow[];
  months: {
    month: string;
    talent: number;
    agencies: number;
    total: number;
    active: number | null;
    invitations_sent: number;
    invitations_accepted: number;
    documents: number;
  }[];
  acquisition: { channel: string; registered: number; spend: number | null; cost: number | null }[];
};
export type PackReference = {
  version: string;
  date: string;
  definitions: { title: string; text: string }[];
  datasets: { label: string; unit: string; includes: string }[];
};
// Print colours for the PDF only (a PDF cannot read the app's theme tokens).
const TEAL: [number, number, number] = [8, 106, 112],
  INK: [number, number, number] = [20, 32, 51],
  BODY: [number, number, number] = [56, 66, 84],
  MUTED: [number, number, number] = [93, 104, 120],
  RULE: [number, number, number] = [237, 232, 224],
  TINT: [number, number, number] = [239, 248, 249];
const MARGIN = 18;
/** The built-in PDF fonts cover Western European text only. */
const clean = (text: string) =>
  text
    .replace(/\s*\u2192\s*/g, ", then ")
    .replace(/[\u2191\u2193]/g, "")
    .replace(/\u2265/g, "at least ")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022\n]/g, "");
const monthLabel = (month: string) => fmtDate(`${month}-01T12:00:00Z`).replace(/^\d+ /, "");
const rand = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, " ")}`;
async function logoData() {
  try {
    const response = await fetch(lockup.url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("The logo could not be read."));
      reader.readAsDataURL(blob);
    });
    const image = new Image();
    image.src = data;
    await image.decode();
    return { data, ratio: image.naturalHeight / image.naturalWidth };
  } catch {
    return null;
  }
}
export async function buildInvestorPack(pack: InvestorPack, reference: PackReference) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true }),
    width = doc.internal.pageSize.getWidth(),
    height = doc.internal.pageSize.getHeight(),
    logo = await logoData();
  let y = MARGIN;
  const room = (needed: number) => {
    if (y + needed > height - 22) {
      doc.addPage();
      y = MARGIN + 4;
    }
  };
  const heading = (text: string, note?: string) => {
    room(30);
    doc
      .setFont("helvetica", "bold")
      .setFontSize(13)
      .setTextColor(...INK);
    doc.text(clean(text), MARGIN, y);
    y += 5;
    if (note) {
      doc
        .setFont("helvetica", "normal")
        .setFontSize(9)
        .setTextColor(...MUTED);
      const lines: string[] = doc.splitTextToSize(clean(note), width - MARGIN * 2);
      doc.text(lines, MARGIN, y);
      y += lines.length * 4;
    }
    y += 1;
  };
  const paragraph = (text: string) => {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9.5)
      .setTextColor(...BODY);
    const lines: string[] = doc.splitTextToSize(clean(text), width - MARGIN * 2);
    room(lines.length * 4.4 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.4 + 2;
  };
  const table = (
    head: string[],
    body: (string | number)[][],
    numeric: number[] = [],
    firstWidth?: number,
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4, bottom: 20 },
      head: [head],
      body: body.map((row) => row.map((cell) => clean(String(cell)))),
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 9,
        textColor: BODY,
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
        lineColor: RULE,
        lineWidth: { bottom: 0.2 },
        overflow: "linebreak",
      },
      headStyles: { fillColor: TINT, textColor: TEAL, fontStyle: "bold", fontSize: 8.5 },
      columnStyles: {
        ...Object.fromEntries(numeric.map((i) => [i, { halign: "right" as const }])),
        ...(firstWidth ? { 0: { cellWidth: firstWidth } } : {}),
      },
      rowPageBreak: "avoid",
      // The last page drawn leaves the cursor at the end of the table.
      didDrawPage: (data) => {
        y = data.cursor?.y ?? y;
      },
    });
    y += 9;
  };
  const figures = (rows: FigureRow[]) =>
    table(
      ["Figure", "Value", "Context"],
      rows.map((r) => [r.label, r.value, r.context]),
      [1],
      70,
    );

  // Cover
  doc.setFillColor(...TINT).rect(0, 0, width, 96, "F");
  if (logo) doc.addImage(logo.data, "PNG", MARGIN, 22, 58, 58 * logo.ratio);
  else {
    doc
      .setFont("helvetica", "bold")
      .setFontSize(22)
      .setTextColor(...TEAL);
    doc.text("TalVault", MARGIN, 34);
  }
  doc
    .setFont("helvetica", "bold")
    .setFontSize(26)
    .setTextColor(...INK);
  doc.text("Investor pack", MARGIN, 66);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(12)
    .setTextColor(...BODY);
  doc.text(clean(`${fmtDate(pack.from)} – ${fmtDate(pack.to)}`), MARGIN, 76);
  doc.setFontSize(10).setTextColor(...MUTED);
  doc.text(
    clean(
      `Real accounts only · South African time · Definitions ${reference.version} (${reference.date})`,
    ),
    MARGIN,
    84,
  );
  y = 112;
  heading(
    "Key figures",
    "Every figure is calculated from TalVault records. Test accounts are excluded.",
  );
  figures([
    ...pack.business,
    {
      label: "Committed monthly revenue",
      value: "Not set",
      context: "Calculates once plan prices are set",
    },
  ]);
  heading(
    "Launch progress",
    pack.launch.settings
      ? `Launch window ${fmtDate(pack.launch.settings.launch_date)} – ${fmtDate(pack.launch.end)}.${
          pack.launch.projection !== null
            ? ` At the current pace, talent reaches ${pack.launch.projection} by the end of the window.`
            : ""
        }`
      : "Launch settings have not been recorded.",
  );
  figures(
    pack.launch_progress.map((r) => ({ ...r, context: r.context ? `${r.context} target` : "" })),
  );
  heading("Revenue");
  paragraph(
    "Paid plans start in 2027 and plan prices have not been set, so there are no paying accounts and no committed revenue yet. Launch-discount membership awaits the verified launch sign-up sheet.",
  );

  doc.addPage();
  y = MARGIN + 4;
  heading(
    "Monthly series since the first record",
    `New accounts, activity, invitations and documents for every month from ${fmtDate(pack.from)}. ${SIGN_IN_HISTORY_NOTE} Those months show "Not recorded" for active users.`,
  );
  table(
    [
      "Month",
      "New talent",
      "New agencies",
      "New accounts",
      "Active users",
      "Invitations sent",
      "Accepted",
      "Documents",
    ],
    pack.months.map((m) => [
      monthLabel(m.month),
      m.talent,
      m.agencies,
      m.total,
      m.active ?? "Not recorded",
      m.invitations_sent,
      m.invitations_accepted,
      m.documents,
    ]),
    [1, 2, 3, 4, 5, 6, 7],
    24,
  );
  heading("Agencies");
  figures(pack.agencies);
  heading("Network effect", "Connections between talent, agencies and trusted contacts.");
  figures(pack.network);
  heading("Feature adoption", "Registered talent using each feature.");
  figures(pack.adoption);
  heading("Trust and security");
  figures(pack.trust);
  heading(
    "Acquisition cost by channel",
    "Cost per registered account from recorded monthly spend.",
  );
  table(
    ["Channel", "Registered", "Spend", "Cost per registration"],
    pack.acquisition.length
      ? pack.acquisition.map((r) => [
          channelLabel(r.channel),
          r.registered,
          r.spend === null ? "Not supplied" : rand(r.spend),
          r.cost === null ? "Not available" : rand(r.cost),
        ])
      : [["No invitations or spend recorded", "", "", ""]],
    [1, 2, 3],
  );
  heading("Data notes");
  figures(pack.quality);
  paragraph(
    `Administrators and deleted profiles are excluded from usage figures. ${SIGN_IN_HISTORY_NOTE} Missing sign-ins never count as inactivity.`,
  );

  doc.addPage();
  y = MARGIN + 4;
  heading(`Definitions ${reference.version}`, `Shared definitions dated ${reference.date}.`);
  table(
    ["Term", "Definition"],
    reference.definitions.map((d) => [d.title, d.text]),
  );
  heading(
    "Data dictionary",
    "The datasets behind these figures. Documents are metadata only; never file contents.",
  );
  table(
    ["Dataset", "One row per", "Includes"],
    reference.datasets.map((d) => [d.label, d.unit, d.includes]),
  );

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc
      .setDrawColor(...RULE)
      .setLineWidth(0.2)
      .line(MARGIN, height - 14, width - MARGIN, height - 14);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(8)
      .setTextColor(...MUTED);
    doc.text(
      clean(`TalVault investor pack · Confidential · Prepared ${fmtDate(pack.generated_at)}`),
      MARGIN,
      height - 9,
    );
    doc.text(`Page ${page} of ${pages}`, width - MARGIN, height - 9, { align: "right" });
  }
  doc.save(`talvault-investor-pack-${pack.to}.pdf`);
}
