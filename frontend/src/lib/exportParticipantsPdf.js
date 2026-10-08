import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function scoreCell(p) {
  if (p.score === null || p.score === undefined) return "-";
  return p.totalMarks ? `${p.score} / ${p.totalMarks}` : String(p.score);
}

function statusCell(p) {
  if (p.completed || p.attemptStatus === "submitted" || p.attemptStatus === "auto_submitted") return "Completed";
  if (p.attemptStatus === "in_progress") return "In progress";
  return "Joined";
}

/**
 * Builds a professional, multi-page PDF of the Demo Quiz → Participate
 * table. Mirrors exportResultsPdf.js styling so every PDF exported from the
 * Admin Portal looks consistent. The rows passed in are exactly the rows
 * rendered on screen (post-search-filter), so the PDF always mirrors what
 * the admin is currently looking at.
 */
export function exportParticipantsPdf({ quizTitle, participants }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 32;

  // Header band
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Eduverse — Quiz Participants Report", marginX, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(200, 210, 225);
  doc.text(quizTitle || "Quiz", marginX, 50);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - marginX, 50, { align: "right" });
  doc.text(`Total participants: ${participants.length}`, pageWidth - marginX, 32, { align: "right" });

  const startY = 96;

  const head = [[
    "Name",
    "Register no.",
    "Email",
    "Department",
    "Year",
    "Section",
    "Participated",
    "Score",
    "Status",
  ]];

  const body = participants.map((p) => [
    p.name || "-",
    p.registerNumber || "-",
    p.email || "-",
    p.department || "-",
    p.year || "-",
    p.section || "-",
    formatDateTime(p.participatedAt),
    scoreCell(p),
    statusCell(p),
  ]);

  autoTable(doc, {
    head,
    body,
    startY,
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
      fontSize: 9,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 90 },
      2: { cellWidth: 140 },
      3: { halign: "center", cellWidth: 90 },
      4: { halign: "center", cellWidth: 55 },
      5: { halign: "center", cellWidth: 55 },
      6: { cellWidth: 90 },
      7: { halign: "center", cellWidth: 70 },
      8: { halign: "center", cellWidth: 90 },
    },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(130, 138, 150);
      doc.text("Eduverse — Confidential participants report", marginX, pageH - 18);
      doc.text(`Page ${page}`, pageWidth - marginX, pageH - 18, { align: "right" });
    },
  });

  if (body.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(110, 120, 135);
    doc.text("No participants yet.", marginX, startY + 24);
  }

  const safeTitle = (quizTitle || "participants").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  doc.save(`participants-${safeTitle || "export"}.pdf`);
}
