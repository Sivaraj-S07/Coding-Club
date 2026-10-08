import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Mail, Lock, ArrowLeft, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import Button from "../../components/ui/Button";
import Logo from "../../components/Logo";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { ApiError } from "../../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const validate = () => {
    const errors = {};
    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!EMAIL_RE.test(email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // guard against double submits
    if (!validate()) return;

    setLoading(true);
    try {
      await login(email.trim(), password);
      push("Signed in to Admin Portal.", "success");
      navigate(location.state?.from?.pathname || "/admin/dashboard", { replace: true });
    } catch (err) {
      // Keep the message generic so we never leak whether the email or password was wrong.
      const message = err instanceof ApiError ? err.message : "Sign in failed. Please try again.";
      push(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-100 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to student portal
        </Link>

        <div className="glass-panel p-8">
          <div className="flex items-center justify-between">
            <Logo />
            <span className="flex items-center gap-1.5 rounded-full bg-violet/10 px-3 py-1 text-[11px] font-medium text-violet-soft">
              <ShieldCheck className="h-3 w-3" /> Admin
            </span>
          </div>
          <h1 className="mt-6 font-display text-xl font-semibold text-ink-100">Sign in to Admin Portal</h1>
          <p className="mt-1 text-sm text-ink-500">Manage quizzes, questions and live results.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="admin-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`glass w-full rounded-xl py-3 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40 ${
                    fieldErrors.email ? "border-coral/60" : ""
                  }`}
                />
              </div>
              {fieldErrors.email && <p className="mt-1.5 text-xs text-coral">{fieldErrors.email}</p>}
            </div>
            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={`glass w-full rounded-xl py-3 pl-10 pr-11 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40 ${
                    fieldErrors.password ? "border-coral/60" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="mt-1.5 text-xs text-coral">{fieldErrors.password}</p>}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-ink-700">
            Credentials are verified against secure, environment-configured admin accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
