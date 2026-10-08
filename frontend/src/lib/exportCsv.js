// Minimal client-side CSV export — builds the file from data already on
// screen (no extra network round-trip) and triggers a browser download.
function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote any cell containing a comma, quote or newline; escape inner quotes.
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {string} filename - without extension, e.g. "leaderboard"
 * @param {string[]} headers - column headers, in order
 * @param {Array<Array<string|number>>} rows - row values, same order as headers
 */
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
