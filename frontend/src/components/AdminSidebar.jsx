import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  Trophy,
  Medal,
  Radio,
  Settings,
  LogOut,
  X,
  Sparkles,
  Users,
  UserRoundX,
  Image,
  ShieldAlert,
  Brain,
} from "lucide-react";
import Logo from "./Logo";
import { useAdminAuth } from "../lib/adminAuth";

const links = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/quizzes", label: "Quizzes", icon: ListChecks },
  { to: "/admin/landing-quizzes", label: "Demo Quizzes", icon: Sparkles },
  { to: "/admin/landing-media", label: "Landing Media", icon: Image },
  { to: "/admin/user-accounts", label: "User Accounts", icon: Users },
  { to: "/admin/guest-accounts", label: "Guest Accounts", icon: UserRoundX },
  { to: "/admin/results", label: "Results", icon: Trophy },
  { to: "/admin/leaderboard", label: "Leaderboard", icon: Medal },
  { to: "/admin/learning-insights", label: "Learning Insights", icon: Brain },
  { to: "/admin/live", label: "Live Monitor", icon: Radio },
  { to: "/admin/security-log", label: "Security Log", icon: ShieldAlert },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

/**
 * Rendered twice by AdminLayout: once as the always-visible desktop rail
 * (`variant="desktop"`, `hidden lg:flex`) and once as the content of a
 * slide-in mobile drawer (`variant="mobile"`, no visibility classes of its
 * own — the drawer wrapper in AdminLayout controls when it's on screen).
 * Kept as one component so the nav list / account card never drift apart.
 */
export default function AdminSidebar({ variant = "desktop", onNavigate }) {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/admin", { replace: true });
  };

  const initials = (admin?.name || admin?.email || "AD")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const wrapperClass =
    variant === "desktop"
      ? "hidden lg:flex sticky top-0 h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r hairline bg-void/50 px-5 py-6 backdrop-blur-2xl"
      : "flex h-full w-full flex-col gap-6 px-5 py-6";

  return (
    <aside className={wrapperClass}>
      <div className="px-1">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "glass side-active text-ink-100"
                  : "text-ink-400 hover:text-ink-100 hover:bg-white/[0.05]"
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="glass-card flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-electric to-violet text-xs font-semibold text-void">
          {initials || "AD"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-100">{admin?.name || "Admin"}</p>
          <p className="truncate text-xs text-ink-500">{admin?.email || ""}</p>
        </div>
        <button onClick={handleLogout} aria-label="Sign out" className="shrink-0 text-ink-500 hover:text-coral transition-colors">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

/** Slide-in drawer version used by AdminLayout below the `lg` breakpoint. */
export function AdminSidebarDrawer({ open, onClose }) {
  return (
    <div
      className={`fixed inset-0 z-[200] lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        className={`fixed inset-y-0 left-0 z-10 w-[82vw] max-w-xs bg-[#080a1b] shadow-2xl shadow-black/60 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-500 hover:bg-white/10 hover:text-ink-100"
        >
          <X className="h-5 w-5" />
        </button>
        <AdminSidebar variant="mobile" onNavigate={onClose} />
      </div>
    </div>
  );
}
