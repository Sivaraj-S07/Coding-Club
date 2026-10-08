import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Builds a professional, multi-page PDF of the admin results table.
 * The rows passed in are exactly the rows rendered on screen, so the PDF
 * always mirrors the portal (same ranking order, same values).
 */
export function exportResultsPdf({ quizTitle, results, summary }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 32;

  // Header band
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageWidth, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Eduverse — Quiz Results Report", marginX, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(200, 210, 225);
  doc.text(quizTitle || "All quizzes", marginX, 50);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - marginX, 50, { align: "right" });
  doc.text(`Total students: ${results.length}`, pageWidth - marginX, 32, { align: "right" });

  let startY = 96;

  if (summary) {
    const cards = [
      ["Highest", `${summary.highestScore}%`],
      ["Average", `${summary.averageScore}%`],
      ["Passed", `${summary.passCount}`],
      ["Failed", `${summary.failCount}`],
    ];
    const gap = 12;
    const cardW = (pageWidth - marginX * 2 - gap * (cards.length - 1)) / cards.length;
    cards.forEach(([label, value], i) => {
      const x = marginX + i * (cardW + gap);
      doc.setFillColor(243, 245, 249);
      doc.setDrawColor(219, 224, 232);
      doc.roundedRect(x, startY, cardW, 44, 6, 6, "FD");
      doc.setFontSize(9);
      doc.setTextColor(110, 120, 135);
      doc.text(label.toUpperCase(), x + 12, startY + 17);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(17, 24, 39);
      doc.text(String(value), x + 12, startY + 35);
      doc.setFont("helvetica", "normal");
    });
    startY += 62;
  }

  const head = [[
    "Rank",
    "Student name",
    "Register no.",
    "Mobile",
    "Dept",
    "Year",
    "Sec",
    "Score",
    "Qns",
    "%",
    "C / W / U",
    "Result",
    "Started",
    "Submitted",
    "Time taken",
  ]];

  const body = results.map((r, i) => [
    String(r.rank ?? i + 1),
    r.student?.name || "-",
    r.student?.register_number || "-",
    r.student?.mobile_number || "-",
    r.student?.department || "-",
    r.student?.year || "-",
    r.student?.section || "-",
    `${r.obtainedMarks} / ${r.totalMarks}`,
    String(r.totalQuestions ?? "-"),
    `${r.percentage}%`,
    `${r.correct} / ${r.wrong} / ${r.unanswered}`,
    r.passed ? "Pass" : "Fail",
    formatDateTime(r.startedAt),
    formatDateTime(r.submittedAt),
    formatDuration(r.timeTakenSeconds),
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
      fontSize: 8,
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
    columnStyles: {
      0: { halign: "center", cellWidth: 30, fontStyle: "bold" },
      1: { cellWidth: 84 },
      2: { cellWidth: 64 },
      3: { halign: "center", cellWidth: 62 },
      4: { halign: "center", cellWidth: 42 },
      5: { halign: "center", cellWidth: 46 },
      6: { halign: "center", cellWidth: 32 },
      7: { halign: "center", cellWidth: 48 },
      8: { halign: "center", cellWidth: 38 },
      9: { halign: "center", cellWidth: 36 },
      10: { halign: "center", cellWidth: 52 },
      11: { halign: "center", cellWidth: 40 },
      12: { cellWidth: 70 },
      13: { cellWidth: 70 },
      14: { halign: "center", cellWidth: 50 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 11) {
        const pass = data.cell.raw === "Pass";
        data.cell.styles.textColor = pass ? [21, 128, 61] : [190, 40, 45];
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(130, 138, 150);
      doc.text("Eduverse — Confidential results report", marginX, pageH - 18);
      doc.text(`Page ${page}`, pageWidth - marginX, pageH - 18, { align: "right" });
    },
  });

  if (body.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(110, 120, 135);
    doc.text("No submissions yet.", marginX, startY + 24);
  }

  const safeTitle = (quizTitle || "results").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  doc.save(`results-${safeTitle || "export"}.pdf`);
}
