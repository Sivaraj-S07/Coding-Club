import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { useAdminAuth } from "../lib/adminAuth";
import { apiFetch } from "../lib/api";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PANEL_WIDTH = 336; // px — keeps the fixed-position maths readable

export default function NotificationBell() {
  const { token } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(false);
    try {
      const data = await apiFetch("/admin/notifications", { token });
      setNotifications(data.notifications || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Marks the given notifications as read on the server AND locally, so the
  // red dot disappears immediately and stays gone after a refresh.
  const markRead = useCallback(
    async (ids) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (!unique.length || !token) return;
      setNotifications((prev) =>
        prev.map((n) => (unique.includes(n.id) ? { ...n, read: true } : n))
      );
      try {
        await apiFetch("/admin/notifications/read", { method: "POST", token, body: { ids: unique } });
      } catch {
        /* the local state already reflects the read — retried on next open */
      }
    },
    [token]
  );

  // Opening the panel means the admin has seen these notifications: their
  // unread dots clear shortly after the list becomes visible.
  useEffect(() => {
    if (!open) return undefined;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return undefined;
    const t = setTimeout(() => markRead(unreadIds), 800);
    return () => clearTimeout(t);
  }, [open, notifications, markRead]);

  // The panel is rendered in a portal with `position: fixed`, anchored to the
  // bell button, so it never affects the header layout or gets clipped.
  const reposition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 12)
    );
    setPosition({ top: rect.bottom + 8, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (panelRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const toggleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => {
      const next = !o;
      if (next) load();
      return next;
    });
  };

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
      className="fixed z-[100] max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0e22] p-2 shadow-2xl shadow-black/60"
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Notifications</p>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && <span className="text-[11px] text-electric-light">{unreadCount} new</span>}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markRead(notifications.map((n) => n.id))}
              aria-label="Mark all as read"
              title="Mark all as read"
              className="text-ink-500 transition-colors hover:text-ink-100"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={load}
            aria-label="Refresh notifications"
            className="text-ink-500 hover:text-ink-100 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && notifications.length === 0 ? (
        <div className="space-y-2 p-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <p className="p-4 text-center text-xs text-ink-500">Couldn't load notifications. Try refreshing.</p>
      ) : notifications.length === 0 ? (
        <p className="p-4 text-center text-xs text-ink-500">No notifications yet.</p>
      ) : (
        <div className="space-y-1">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markRead([n.id])}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06] ${
                n.read ? "" : "bg-electric/[0.06]"
              }`}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric/10 text-electric-light">
                {n.type === "submission" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs leading-snug ${n.read ? "text-ink-300" : "text-ink-100"}`}>{n.message}</p>
                <p className="mt-0.5 text-[10px] text-ink-700">{timeAgo(n.timestamp)}</p>
              </div>
              {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative glass flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:text-ink-100 transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-coral" />}
      </button>
      {open && typeof document !== "undefined" && createPortal(panel, document.body)}
    </>
  );
}
