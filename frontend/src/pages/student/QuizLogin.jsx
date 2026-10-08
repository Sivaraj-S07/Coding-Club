import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, Lock, User, Hash, Phone, Loader2, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { apiFetch, ApiError } from "../../lib/api";
import { setStudentSession } from "../../lib/studentAuth";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { DEPARTMENTS, YEARS, SECTIONS } from "../../lib/options";

const textInputCls = "field-input py-3 pl-10 pr-4 text-sm";
const selectCls = "field-input px-3 py-3 text-sm";

export default function QuizLogin() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const [searchParams] = useSearchParams();
  // Demo Quizzes (Landing Page placement) can be joined and attended without
  // an account — regular Quizzes still require Sign Up / Sign In first. When
  // an account session DOES exist, it's used only to prefill (fields stay
  // editable, never locked).
  const { student: account, isAuthenticated } = useStudentAccountAuth();

  const [quiz, setQuiz] = useState(null);
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [registerTouched, setRegisterTouched] = useState(false);
  const [mobileTouched, setMobileTouched] = useState(false);

  // Registration collects exactly: name, register number, department, year,
  // section, mobile number, and the quiz password. No Email ID field.
  const [form, setForm] = useState({
    name: account?.name || "",
    registerNumber: account?.registerNumber || "",
    department: "",
    year: "",
    section: "",
    mobileNumber: "",
    quizPassword: searchParams.get("pw") || "",
  });

  const setField = useCallback((key, value) => {
    setForm((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/quizzes/${quizId}`)
      .then((data) => {
        if (!cancelled) setQuiz(data.quiz);
      })
      .catch((err) => {
        if (!cancelled) push(err instanceof ApiError ? err.message : "Failed to load quiz", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingQuiz(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const registerNumberError = useMemo(() => {
    const value = form.registerNumber;
    if (!value.trim()) return "Registration number is required.";
    if (!/^[0-9]+$/.test(value)) return "Only digits (0-9) are allowed.";
    if (value.length !== 12)
      return `Registration number must be exactly 12 digits (${value.length}/12).`;
    return "";
  }, [form.registerNumber]);
  const showRegisterError = registerTouched && registerNumberError;

  const mobileNumberError = useMemo(() => {
    const value = form.mobileNumber;
    if (!value.trim()) return "Mobile number is required.";
    if (!/^[0-9]+$/.test(value)) return "Only digits (0-9) are allowed.";
    if (value.length !== 10) return `Mobile number must be exactly 10 digits (${value.length}/10).`;
    return "";
  }, [form.mobileNumber]);
  const showMobileError = mobileTouched && mobileNumberError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setRegisterTouched(true);
    setMobileTouched(true);
    if (registerNumberError) {
      push(registerNumberError, "warning");
      return;
    }
    if (mobileNumberError) {
      push(mobileNumberError, "warning");
      return;
    }
    if (!form.name.trim() || !form.department || !form.year || !form.section || !form.quizPassword) {
      push("All fields are required.", "warning");
      return;
    }
    if (
      !DEPARTMENTS.includes(form.department) ||
      !YEARS.includes(form.year) ||
      !SECTIONS.includes(form.section)
    ) {
      push("Please pick a valid department, year and section.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch("/students/login", {
        method: "POST",
        body: { quizId, ...form },
      });
      setStudentSession(quizId, {
        token: data.token,
        name: data.student.name,
        registerNumber: data.student.registerNumber,
      });
      push(`Welcome, ${data.student.name}!`, "success");
      navigate(`/quiz/${quizId}`);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to join quiz", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Regular Quizzes still require an account (Sign Up / Sign In) before
  // joining — only Demo Quizzes (Landing Page placement) can be joined and
  // attended without signing in. This is only known once the quiz itself has
  // loaded, so the redirect happens here rather than at the route level.
  if (!loadingQuiz && quiz && !quiz.isDemo && !isAuthenticated) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10 lg:px-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to quizzes
      </Link>

      {loadingQuiz ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : !quiz ? (
        <div className="glass-card p-10 text-center text-sm text-ink-300">
          This quiz could not be found.
        </div>
      ) : (
        <div className="glass-panel p-8">
          <h1 className="font-display text-xl font-semibold text-ink-100">{quiz.title}</h1>
          {quiz.isDemo && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-electric/10 px-3 py-1 text-[11px] font-medium text-electric-light">
              <Sparkles className="h-3 w-3" /> Demo Quiz — no sign-in required
            </span>
          )}
          <p className="mt-1 text-sm text-ink-300">{quiz.description}</p>
          <div className="mt-3 flex gap-4 text-xs text-ink-300">
            <span>{quiz.questionCount} questions</span>
            <span>{quiz.durationMinutes} minutes</span>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="field-label" htmlFor="student-name">
                Full name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="student-name"
                  className={textInputCls}
                  placeholder="Your full name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="student-register">
                Register number
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="student-register"
                  className={textInputCls}
                  placeholder="12-digit register number"
                  value={form.registerNumber}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  required
                  aria-invalid={showRegisterError ? "true" : "false"}
                  onBlur={() => setRegisterTouched(true)}
                  onChange={(e) =>
                    setField("registerNumber", e.target.value.replace(/[^0-9]/g, "").slice(0, 12))
                  }
                />
              </div>
              {showRegisterError ? (
                <p className="mt-1.5 text-xs font-medium text-red-400">{registerNumberError}</p>
              ) : (
                <p className="mt-1.5 text-xs text-ink-300">Exactly 12 digits, numbers only.</p>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="student-mobile">
                Mobile number
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="student-mobile"
                  className={textInputCls}
                  placeholder="10-digit mobile number"
                  value={form.mobileNumber}
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  required
                  aria-invalid={showMobileError ? "true" : "false"}
                  onBlur={() => setMobileTouched(true)}
                  onChange={(e) =>
                    setField("mobileNumber", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))
                  }
                />
              </div>
              {showMobileError ? (
                <p className="mt-1.5 text-xs font-medium text-red-400">{mobileNumberError}</p>
              ) : (
                <p className="mt-1.5 text-xs text-ink-300">Exactly 10 digits, numbers only.</p>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="student-department">
                Department
              </label>
              <select
                id="student-department"
                className={selectCls}
                value={form.department}
                required
                onChange={(e) => setField("department", e.target.value)}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="student-year">
                  Year
                </label>
                <select
                  id="student-year"
                  className={selectCls}
                  value={form.year}
                  required
                  onChange={(e) => setField("year", e.target.value)}
                >
                  <option value="">Select year</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="student-section">
                  Section
                </label>
                <select
                  id="student-section"
                  className={selectCls}
                  value={form.section}
                  required
                  onChange={(e) => setField("section", e.target.value)}
                >
                  <option value="">Select section</option>
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="student-password">
                Quiz password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="student-password"
                  type="password"
                  className={textInputCls}
                  placeholder="Password from your instructor"
                  autoComplete="off"
                  value={form.quizPassword}
                  onChange={(e) => setField("quizPassword", e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || Boolean(registerNumberError) || Boolean(mobileNumberError)}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Joining..." : "Join quiz"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
