import AccountRoleSelector from "../../components/AccountRoleSelector";
import { useMemo, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { User, Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, Check, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Logo from "../../components/Logo";
import { useToast } from "../../components/ui/Toast";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { ApiError } from "../../lib/api";
import { passwordRuleResults, isStrongPassword } from "../../lib/passwordPolicy";

const textInputCls = "field-input py-3 pl-10 pr-4 text-sm";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { signUp } = useStudentAccountAuth();

  const [username, setUsername] = useState("");
  const [role, setRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const passwordRules = useMemo(() => passwordRuleResults(password), [password]);
  const passwordStrong = useMemo(() => isStrongPassword(password), [password]);

  const validate = () => {
    const errors = {};
    if (!username.trim()) {
      errors.username = "Username is required.";
    } else if (!/^[A-Za-z0-9._-]{3,30}$/.test(username.trim())) {
      errors.username = "3-30 characters: letters, numbers, dots, underscores or hyphens.";
    }
    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!EMAIL_RE.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
    if (!passwordStrong) {
      errors.password = "Password does not meet all requirements below.";
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordTouched(true);
    if (loading) return;
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await signUp({
        username: username.trim(),
        email: email.trim(),
        password,
        confirmPassword,
        role,
      });
      push(`Welcome to Eduverse, ${data.student.username}!`, "success");
      // Sign Up only collects Username/Email/Password — Register Number,
      // Mobile Number and the rest are collected next on /profile, which
      // StudentAccountProtectedRoute forces anyway, but sending them there
      // directly (instead of /dashboard) avoids a redirect bounce.
      navigate(role === "mentor" ? "/mentor/dashboard" : "/profile", { replace: true, state: { forceComplete: role !== "mentor" } });
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? err.details : null;
      push(details?.[0] || (err instanceof ApiError ? err.message : "Sign up failed. Please try again."), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-100 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <div className="glass-panel p-8">
          <Logo />
          <h1 className="mt-6 font-display text-xl font-semibold text-ink-100">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">
            Your next chapter starts here.
          </p>

          <AccountRoleSelector value={role} onChange={setRole} />
          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div>
              <label htmlFor="signup-username" className="field-label">
                Username
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. arjun_codes"
                  aria-invalid={Boolean(fieldErrors.username)}
                  className={textInputCls}
                />
              </div>
              {fieldErrors.username && <p className="mt-1.5 text-xs text-coral">{fieldErrors.username}</p>}
            </div>

            <div>
              <label htmlFor="signup-email" className="field-label">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={textInputCls}
                />
              </div>
              {fieldErrors.email && <p className="mt-1.5 text-xs text-coral">{fieldErrors.email}</p>}
            </div>

            <div>
              <label htmlFor="signup-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordTouched(true)}
                  placeholder="Create a strong password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="field-input py-3 pl-10 pr-11 text-sm"
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
              {passwordTouched && (
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {passwordRules.map((rule) => (
                    <li
                      key={rule.key}
                      className={`flex items-center gap-1.5 text-[11px] ${
                        rule.passed ? "text-mint" : "text-ink-500"
                      }`}
                    >
                      {rule.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {rule.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="signup-confirm" className="field-label">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  id="signup-confirm"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  className="field-input py-3 pl-10 pr-11 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100 transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1.5 text-xs text-coral">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Creating account..." : "Sign up"}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-500">
            Already have an account?{" "}
            <Link to="/signin" state={location.state} className="font-medium text-electric-light hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
