import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rowFor(r) {
  return [
    `#${r.rank}`,
    r.name || "-",
    r.registerNumber || "-",
    [r.department, r.year, r.section].filter(Boolean).join(" / ") || "-",
    String(r.quizzesAttended ?? "-"),
    `${r.cumulativePercentage}%`,
    formatDateTime(r.lastSubmittedAt),
  ];
}

const HEAD = [["Rank", "Name", "Register No.", "Dept / Year / Sec", "Quizzes", "Cumulative %", "Last Submitted"]];
const COLUMN_STYLES = {
  0: { halign: "center", cellWidth: 46, fontStyle: "bold" },
  1: { cellWidth: 130 },
  2: { cellWidth: 90 },
  3: { cellWidth: 110 },
  4: { halign: "center", cellWidth: 60 },
  5: { halign: "center", cellWidth: 80 },
  6: { cellWidth: 100 },
};

function drawSectionTable(doc, { title, rows, startY, marginX, pageWidth }) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(17, 24, 39);
  doc.text(title, marginX, startY);

  const tableStartY = startY + 10;

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(120, 128, 140);
    doc.text("No submissions yet.", marginX, tableStartY + 12);
    return tableStartY + 30;
  }

  autoTable(doc, {
    head: HEAD,
    body: rows.map(rowFor),
    startY: tableStartY,
    margin: { left: marginX, right: marginX, bottom: 42 },
    theme: "grid",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 5,
      overflow: "linebreak",
      lineColor: [222, 227, 235],
      lineWidth: 0.5,
      textColor: [32, 38, 50],
      valign: "middle",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: COLUMN_STYLES,
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(130, 138, 150);
      doc.text("Eduverse — Confidential leaderboard report", marginX, pageH - 18);
      doc.text(`Page ${page}`, pageWidth - marginX, pageH - 18, { align: "right" });
    },
  });

  return doc.lastAutoTable.finalY + 28;
}

/**
 * Builds a two-section PDF (Signed-in users, then Guest accounts) of the
 * leaderboard exactly as currently shown on screen (same rows, same order,
 * respecting any active search filter).
 */
export function exportLeaderboardPdf({ leaderboard, guests }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 32;

  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Eduverse — Leaderboard Report", marginX, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(200, 210, 225);
  doc.text("Signed-in users ranked by cumulative percentage — Guest accounts kept separate", marginX, 50);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - marginX, 50, { align: "right" });
  doc.text(`Total entries: ${leaderboard.length + guests.length}`, pageWidth - marginX, 32, { align: "right" });

  let y = 96;
  y = drawSectionTable(doc, { title: `Signed-in users (${leaderboard.length})`, rows: leaderboard, startY: y, marginX, pageWidth });

  // Start the Guest accounts section on a fresh page if there isn't
  // reasonable room left for its heading + at least one row.
  if (y > pageHeight - 120) {
    doc.addPage();
    y = 40;
  }
  drawSectionTable(doc, { title: `Guest accounts (${guests.length})`, rows: guests, startY: y, marginX, pageWidth });

  doc.save("leaderboard.pdf");
}
