import { useEffect, useState } from "react";
import { Images, Download, X, ChevronLeft, ChevronRight } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import DemoChip from "../../components/ui/DemoChip";
import { apiFetch } from "../../lib/api";
import { DEMO_ENABLED, demoMedia } from "../../lib/demoData";

// Downloads a media item by URL. Tries a same-origin/CORS-friendly blob
// download first (so the browser actually saves the file instead of just
// navigating to it); if that's blocked (cross-origin without CORS headers),
// falls back to opening it in a new tab so the person can save it manually.
async function downloadMedia(url, filename, onFallback) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("download failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    onFallback?.();
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function filenameFor(item) {
  const ext = item.type === "video" ? "mp4" : "jpg";
  const base = (item.title || "eduverse-media").trim().replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  return `${base || "eduverse-media"}.${ext}`;
}

export default function Gallery() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const { push } = useToast();

  useEffect(() => {
    let alive = true;
    apiFetch("/media/landing")
      .then((data) => {
        if (!alive) return;
        const list = data.media || [];
        if (list.length === 0 && DEMO_ENABLED) {
          setMedia(demoMedia());
          setIsDemo(true);
        } else {
          setMedia(list);
        }
      })
      .catch(() => {
        if (!alive) return;
        if (DEMO_ENABLED) {
          setMedia(demoMedia());
          setIsDemo(true);
        } else {
          setError("Couldn't load the gallery right now.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i + 1) % media.length);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i - 1 + media.length) % media.length);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxIndex, media.length]);

  const handleDownload = (item) => {
    downloadMedia(item.url, filenameFor(item), () =>
      push("Opening the file in a new tab — use your browser's save option to download it.", "info")
    );
  };

  const active = lightboxIndex !== null ? media[lightboxIndex] : null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="mb-8 flex items-center gap-2">
        <Images className="h-5 w-5 text-electric-light" />
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold text-ink-100 sm:text-3xl">
            Gallery {isDemo && <DemoChip />}
          </h1>
          <p className="mt-1 text-sm text-ink-500">Photos and videos from Eduverse events — click any item for the full view.</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-10 text-center text-sm text-coral">{error}</div>
      ) : media.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">No photos or videos have been published yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m, i) => (
            <div key={m.id} className="glass-card group overflow-hidden">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block h-56 w-full overflow-hidden bg-black/30"
                aria-label={`View ${m.title || "media"} in full size`}
              >
                {m.type === "image" ? (
                  <img
                    src={m.url}
                    alt={m.title || "Eduverse"}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                )}
              </button>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  {m.title && <p className="truncate font-display text-sm font-semibold text-ink-100">{m.title}</p>}
                  {m.caption && <p className="mt-1 line-clamp-2 text-xs text-ink-500">{m.caption}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(m)}
                  aria-label={`Download ${m.title || "media"}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-electric/15 px-3 py-2 text-xs font-medium text-electric-light transition-colors hover:bg-electric/25"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-view lightbox */}
      {active && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1020] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>

          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setLightboxIndex((i) => (i - 1 + media.length) % media.length)}
                aria-label="Previous"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:left-4"
              >
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxIndex((i) => (i + 1) % media.length)}
                aria-label="Next"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:right-4"
              >
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}

          <div className="flex max-h-[80vh] max-w-5xl flex-col items-center gap-4">
            {active.type === "image" ? (
              <img src={active.url} alt={active.title || "Eduverse"} className="max-h-[70vh] max-w-full rounded-xl object-contain" />
            ) : (
              <video src={active.url} className="max-h-[70vh] max-w-full rounded-xl" controls autoPlay playsInline />
            )}
            <div className="flex w-full max-w-lg items-center justify-between gap-4 text-center">
              <div className="min-w-0 text-left">
                {active.title && <p className="truncate font-display text-sm font-semibold text-white">{active.title}</p>}
                {active.caption && <p className="mt-0.5 line-clamp-2 text-xs text-white/60">{active.caption}</p>}
              </div>
              <button
                type="button"
                onClick={() => handleDownload(active)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-electric/20 px-4 py-2.5 text-sm font-medium text-electric-light transition-colors hover:bg-electric/30"
              >
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
