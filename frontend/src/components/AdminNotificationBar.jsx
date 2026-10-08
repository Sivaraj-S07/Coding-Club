import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  UserPlus,
  X,
} from "lucide-react";
import { useAdminAuth } from "../lib/adminAuth";
import { apiFetch } from "../lib/api";
import { connectAdminSocket } from "../lib/socket";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function iconFor(type) {
  if (type === "submission") return CheckCircle2;
  if (type === "registration") return UserPlus;
  return FileText;
}

/**
 * Notification bar pinned under the Admin Portal header.
 *
 * Clicking the bar expands the FULL list of notifications. Each notification
 * carries its own red unread dot; the dot disappears as soon as the admin has
 * actually seen (or clicked) that notification, and the read state is stored
 * on the server so it never comes back after a refresh.
 */
export default function AdminNotificationBar() {
  const { token } = useAdminAuth();
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const seenIds = useRef(new Set());

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("/admin/notifications", { token });
      const list = data.notifications || [];
      list.forEach((n) => seenIds.current.add(n.id));
      // Live-only entries (socket events not yet part of the server feed) are
      // preserved so nothing disappears on a refresh of the list.
      setItems((prev) => {
        const serverIds = new Set(list.map((n) => n.id));
        const liveOnly = prev.filter((n) => n.live && !serverIds.has(n.id));
        return [...liveOnly, ...list].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
      });
    } catch {
      /* the bar simply stays empty if the feed can't be reached */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = useCallback(
    async (ids) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (!unique.length) return;
      setItems((prev) => prev.map((n) => (unique.includes(n.id) ? { ...n, read: true } : n)));
      if (!token) return;
      // Live-only ids are local; the server still records them harmlessly.
      try {
        await apiFetch("/admin/notifications/read", { method: "POST", token, body: { ids: unique } });
      } catch {
        /* local read state is already applied */
      }
    },
    [token]
  );

  // Expanding the bar means the admin is reading the list: unread dots clear
  // right after the notifications become visible.
  useEffect(() => {
    if (!expanded) return undefined;
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return undefined;
    const t = setTimeout(() => markRead(unreadIds), 800);
    return () => clearTimeout(t);
  }, [expanded, items, markRead]);

  // Live events — prepended so the newest activity is what admins see first.
  useEffect(() => {
    if (!token) return undefined;
    const add = (item) => {
      if (seenIds.current.has(item.id)) return;
      seenIds.current.add(item.id);
      setItems((prev) => [{ ...item, read: false, live: true }, ...prev].slice(0, 40));
      setDismissed(false);
    };
    return connectAdminSocket(token, {
      "registration:new": (payload) => {
        const s = payload?.student || {};
        add({
          id: `live-reg-${s.id || Math.random()}-${payload?.joinedAt || Date.now()}`,
          type: "registration",
          message: `${s.name || "A student"}${s.registerNumber ? ` (${s.registerNumber})` : ""} registered for a quiz`,
          timestamp: payload?.joinedAt || new Date().toISOString(),
        });
      },
      "result:new": (payload) => {
        const pct = Math.round(Number(payload?.percentage) || 0);
        add({
          id: `live-res-${payload?.attemptId || Math.random()}`,
          type: "submission",
          message: `New submission scored ${pct}%${payload?.passed ? " (passed)" : " (below passing)"}`,
          timestamp: payload?.submittedAt || new Date().toISOString(),
        });
      },
    });
  }, [token]);

  if (dismissed || items.length === 0) return null;

  const current = items[0];
  const CurrentIcon = iconFor(current.type);

  return (
    <div className="border-b hairline bg-electric/[0.07]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 lg:px-8">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide notifications" : "Show all notifications"}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric-light">
            <Bell className="h-3.5 w-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-coral" />
            )}
          </span>
          <CurrentIcon className="hidden h-3.5 w-3.5 shrink-0 text-electric-light sm:block" />
          <span className="truncate text-xs text-ink-100 sm:text-sm">{current.message}</span>
          <span className="hidden shrink-0 text-[11px] text-ink-700 sm:inline">
            {timeAgo(current.timestamp)}
          </span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-1 hidden text-[11px] tabular-nums text-ink-500 sm:inline">
            {unreadCount > 0 ? `${unreadCount} unread` : `${items.length} total`}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              aria-label="Mark all as read"
              title="Mark all as read"
              onClick={() => markRead(items.map((n) => n.id))}
              className="rounded-md p-1 text-ink-500 transition-colors hover:text-ink-100"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Refresh notifications"
            onClick={load}
            className="rounded-md p-1 text-ink-500 transition-colors hover:text-ink-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            aria-label={expanded ? "Collapse notifications" : "Expand notifications"}
            onClick={() => setExpanded((e) => !e)}
            className="rounded-md p-1 text-ink-500 transition-colors hover:text-ink-100"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Dismiss notifications"
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-ink-500 transition-colors hover:text-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="max-h-[60vh] overflow-y-auto border-t hairline px-5 pb-3 lg:px-8">
          <div className="divide-y divide-white/[0.06]">
            {items.map((n) => {
              const Icon = iconFor(n.type);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead([n.id])}
                  className="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric/10 text-electric-light">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs sm:text-sm ${n.read ? "text-ink-300" : "text-ink-100"}`}>
                      {n.message}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-700">{timeAgo(n.timestamp)}</span>
                  </span>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-coral" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
