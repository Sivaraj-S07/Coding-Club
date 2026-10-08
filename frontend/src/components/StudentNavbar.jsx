import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogIn, UserPlus, LogOut, LayoutDashboard, User, Accessibility, Brain, Bot, Users } from "lucide-react";
import Logo from "./Logo";
import { useStudentAccountAuth } from "../lib/studentAccountAuth";
import { useAccessibility } from "../lib/accessibility";
import AccessibilityMenu from "./ai/AccessibilityMenu";

// Signed-out visitors see the public Landing Page nav; signed-in students
// see the private Dashboard nav. Sign In / Sign Up never appear once signed
// in, and Dashboard / Quizzes / Profile never appear before signing in —
// the two menus are mutually exclusive and switch automatically based on
// auth state. Home, Demo Quiz, Programming and Gallery are each their own
// page/route (no scroll-to-anchor links) and always appear as top tabs.
// `label` is a translation key (English / Tamil — see lib/i18n.js).
const GUEST_NAV_ITEMS = [
  { to: "/", label: "nav.home" },
  { to: "/demo-quiz", label: "nav.demoQuiz" },
  { to: "/programming", label: "nav.programming" },
  { to: "/gallery", label: "nav.gallery" },
];

const AUTHED_NAV_ITEMS = [
  { to: "/dashboard", label: "nav.dashboard" },
  { to: "/teams", label: "nav.teams" },
  { to: "/learn", label: "nav.learn" },
  { to: "/tutor", label: "nav.tutor" },
  { to: "/quizzes", label: "nav.quizzes" },
  { to: "/programming", label: "nav.programming" },
  { to: "/gallery", label: "nav.gallery" },
  { to: "/profile", label: "nav.profile" },
];

export default function StudentNavbar() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, signOut, role } = useStudentAccountAuth();
  const { t } = useAccessibility();

  const navItems = isAuthenticated ? role === "mentor" ? [{to:"/mentor/dashboard",label:"nav.mentor"}] : AUTHED_NAV_ITEMS : GUEST_NAV_ITEMS;

  // Close the mobile menu whenever the route changes, and never leave the
  // page scroll-locked behind a stale drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const isActive = (to) => {
    const [path, itemHash] = to.split("#");
    if (itemHash) return pathname === "/" && hash === `#${itemHash}`;
    return path === "/" ? pathname === "/" && !hash : pathname.startsWith(path);
  };

  const iconFor = (to) => {
    if (to === "/teams" || to === "/mentor/dashboard") return Users;
    if (to === "/dashboard") return LayoutDashboard;
    if (to === "/profile") return User;
    if (to === "/learn") return Brain;
    if (to === "/tutor") return Bot;
    return null;
  };

  const handleSignOut = () => {
    signOut();
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-void/60 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
        <Link to={isAuthenticated ? role === "mentor" ? "/mentor/dashboard" : "/dashboard" : "/"} onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav aria-label="Main" className="desk-nav hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const Icon = iconFor(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                  isActive(item.to) ? "ev-active text-ink-100" : "text-ink-400 hover:bg-white/[0.04] hover:text-ink-100"
                }`}
              >
                {Icon && <Icon className="h-4 w-4" />} {t(item.label)}
              </Link>
            );
          })}
        </nav>

        <div className="desk-nav hidden items-center gap-2 lg:flex">
          <AccessibilityMenu />
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-coral"
            >
              <LogOut className="h-4 w-4" /> {t("nav.signOut")}
            </button>
          ) : (
            <>
              <Link
                to="/signin"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-ink-100"
              >
                <LogIn className="h-4 w-4" /> {t("nav.signIn")}
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-electric/30 bg-electric/15 px-3.5 py-2 text-sm font-medium text-electric-light shadow-[0_0_18px_rgba(77,141,255,0.18)] transition-all hover:bg-electric/25 hover:shadow-[0_0_24px_rgba(77,141,255,0.35)]"
              >
                <UserPlus className="h-4 w-4" /> {t("nav.signUp")}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="mob-toggle rounded-lg p-2 text-ink-300 hover:bg-white/10 hover:text-ink-100 lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu: a simple dropdown panel under the header, rather than a
          full-screen overlay, so students can still see where they are. */}
      {open && (
        <nav aria-label="Mobile" className="mob-nav max-h-[calc(100vh-4.5rem)] overflow-y-auto border-t hairline bg-void/95 px-5 pb-4 pt-2 backdrop-blur-2xl lg:hidden">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = iconFor(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(item.to) ? "glass text-ink-100" : "text-ink-500 hover:text-ink-100 hover:bg-white/[0.04]"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />} {t(item.label)}
                </Link>
              );
            })}

            <Link
              to="/accessibility"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive("/accessibility") ? "glass text-ink-100" : "text-ink-500 hover:text-ink-100 hover:bg-white/[0.04]"
              }`}
            >
              <Accessibility className="h-4 w-4" /> {t("nav.accessibility")}
            </Link>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-500 hover:bg-white/[0.04] hover:text-coral"
              >
                <LogOut className="h-4 w-4" /> {t("nav.signOut")}
              </button>
            ) : (
              <>
                <Link
                  to="/signin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-500 hover:bg-white/[0.04] hover:text-ink-100"
                >
                  <LogIn className="h-4 w-4" /> {t("nav.signIn")}
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-electric-light hover:bg-white/[0.04]"
                >
                  <UserPlus className="h-4 w-4" /> {t("nav.signUp")}
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
