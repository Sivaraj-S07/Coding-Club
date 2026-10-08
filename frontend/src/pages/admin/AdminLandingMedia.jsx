import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Trash2,
  Image as ImageIcon,
  Film,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Admin Portal -> Landing Media. Upload and manage the images/videos shown
 * in a gallery section on the public Landing Page. Files are stored in
 * Supabase Storage; this page manages the metadata (title, caption, active
 * state, display order) on top of them.
 */
export default function AdminLandingMedia() {
  const { token } = useAdminAuth();
  const { push } = useToast();
  const fileInputRef = useRef(null);

  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/admin/media", { token });
      setMedia(data.media || []);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load landing media";
      setError(message);
      push(message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadTitle.trim()) form.append("title", uploadTitle.trim());
      if (uploadCaption.trim()) form.append("caption", uploadCaption.trim());
      await apiFetch("/admin/media", { method: "POST", token, body: form });
      push("Media uploaded.", "success");
      setUploadTitle("");
      setUploadCaption("");
      load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to upload media", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggleActive = async (item) => {
    setBusyId(item.id);
    try {
      await apiFetch(`/admin/media/${item.id}`, {
        method: "PATCH",
        token,
        body: { isActive: !item.isActive },
      });
      setMedia((prev) => prev.map((m) => (m.id === item.id ? { ...m, isActive: !item.isActive } : m)));
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to update media", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleMove = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= media.length) return;
    const next = [...media];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setMedia(next);
    try {
      await apiFetch("/admin/media/reorder", {
        method: "PUT",
        token,
        body: { orderedIds: next.map((m) => m.id) },
      });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to reorder media", "error");
      load();
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusyId(confirmDelete.id);
    try {
      await apiFetch(`/admin/media/${confirmDelete.id}`, { method: "DELETE", token });
      push("Media item deleted.", "success");
      setConfirmDelete(null);
      load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete media", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout
      title="Landing Media"
      subtitle="Upload and manage images/videos shown on the public Landing Page"
    >
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-electric/5 px-4 py-3 text-xs text-ink-500">
        <Sparkles className="h-3.5 w-3.5 flex-none text-electric-light" />
        Active items appear, in this order, in a gallery section on the public Landing Page. Toggle an
        item off to hide it without deleting it.
      </div>

      {/* Upload form */}
      <div className="glass-card mb-6 p-5">
        <h3 className="mb-3 font-display text-sm font-semibold text-ink-100">Upload new media</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Title (optional)"
            maxLength={200}
            className="glass rounded-xl px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
          <input
            value={uploadCaption}
            onChange={(e) => setUploadCaption(e.target.value)}
            placeholder="Caption (optional)"
            maxLength={500}
            className="glass rounded-xl px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
            id="landing-media-file-input"
          />
          <Button
            icon={Upload}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading..." : "Choose file & upload"}
          </Button>
          <span className="text-xs text-ink-500">
            Images (PNG/JPEG/WEBP/GIF) up to 8MB, videos (MP4/WEBM/OGG/MOV) up to 60MB.
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : media.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">
          No media uploaded yet. Use the form above to add the first image or video.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item, index) => (
            <div key={item.id} className="glass-card overflow-hidden">
              <div className="flex h-40 items-center justify-center overflow-hidden bg-black/30">
                {item.type === "image" ? (
                  <img src={item.url} alt={item.title || "Landing media"} className="h-full w-full object-cover" />
                ) : (
                  <video src={item.url} className="h-full w-full object-cover" muted />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-ink-500">
                    {item.type === "image" ? (
                      <ImageIcon className="h-3.5 w-3.5" />
                    ) : (
                      <Film className="h-3.5 w-3.5" />
                    )}
                    {item.type}
                  </div>
                  <Badge tone={item.isActive ? "live" : "draft"}>{item.isActive ? "Visible" : "Hidden"}</Badge>
                </div>
                <p className="mt-1.5 truncate font-display text-sm font-semibold text-ink-100">
                  {item.title || "Untitled"}
                </p>
                {item.caption && <p className="mt-1 line-clamp-2 text-xs text-ink-500">{item.caption}</p>}
                <p className="mt-2 text-[11px] text-ink-700">{formatBytes(item.fileSizeBytes)}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={item.isActive ? EyeOff : Eye}
                    disabled={busyId === item.id}
                    onClick={() => handleToggleActive(item)}
                  >
                    {item.isActive ? "Hide" : "Show"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowUp}
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    aria-label="Move up"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowDown}
                    disabled={index === media.length - 1}
                    onClick={() => handleMove(index, 1)}
                    aria-label="Move down"
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    disabled={busyId === item.id}
                    onClick={() => setConfirmDelete(item)}
                    className="ml-auto"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete media item?"
        description={`This permanently removes "${confirmDelete?.title || "this item"}" from storage and the Landing Page gallery.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </AdminLayout>
  );
}
