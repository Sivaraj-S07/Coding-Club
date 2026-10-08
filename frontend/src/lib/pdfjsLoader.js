// Loads PDF.js on demand (it is large, and only Import Quiz from PDF needs it).
// The "legacy" build is used so older admin browsers keep working.
let pdfjsPromise = null;

export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.mjs?url"),
    ])
      .then(([lib, worker]) => {
        lib.GlobalWorkerOptions.workerSrc = worker.default;
        return lib;
      })
      .catch((err) => {
        pdfjsPromise = null; // allow a retry (e.g. after a network hiccup)
        throw err;
      });
  }
  return pdfjsPromise;
}
