import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Trophy,
  Radio,
  ShieldCheck,
  Terminal,
  Users,
  LogIn,
  UserPlus,
  LayoutDashboard,
  Images,
  Clock,
  ListChecks,
  CheckCircle2,
  Quote,
  Medal,
} from "lucide-react";
import Logo from "../../components/Logo";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import DemoChip from "../../components/ui/DemoChip";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import StudentTutorial, { hasSeenStudentTutorial } from "../../components/StudentTutorial";
import { apiFetch } from "../../lib/api";
import { DEMO_ENABLED, demoQuizzes, demoLeaderboard, demoInitials } from "../../lib/demoData";

const FEATURES = [
  {
    icon: Trophy,
    title: "Live quizzes & assessments",
    body: "Join timed MCQ, fill-in-the-blank and coding quizzes with instant scoring and a live leaderboard.",
  },
  {
    icon: Terminal,
    title: "Programming practice",
    body: "Solve LeetCode/HackerRank-style problems in the built-in code editor with real compilers and hidden test cases.",
  },
  {
    icon: ShieldCheck,
    title: "Fair, proctored attempts",
    body: "Tab-switch detection, per-question timers and auto-submit keep every assessment fair for everyone.",
  },
  {
    icon: Radio,
    title: "Real-time results",
    body: "Scores, rankings and attendance update live, so you and your coordinators always see where things stand.",
  },
];

const STATS = [
  { label: "Languages supported", value: "C, C++, Java, Python & more" },
  { label: "Question types", value: "MCQ · Fill-in-the-blank · Coding" },
  { label: "Built for", value: "College coding clubs & classrooms" },
];

const NUMBERS = [
  { value: "480+", label: "Students enrolled" },
  { value: "9", label: "Quizzes this term" },
  { value: "870+", label: "Attempts submitted" },
  { value: "4", label: "Languages in the editor" },
];

const STEPS = [
  { title: "Create your account", body: "Sign up with your register number. It takes under a minute and keeps every result in one dashboard." },
  { title: "Join a quiz or practise", body: "Enter a live quiz with your class, or open the code editor and work through problems at your own pace." },
  { title: "Track your rank", body: "Scores land on the leaderboard the moment you submit, with a full breakdown of what you got right." },
];

const TESTIMONIALS = [
  { name: "Priya Dharshini", role: "II CSE", quote: "The live leaderboard made quiz night feel like a real contest. I went from 14th to 3rd in a month." },
  { name: "Karthik Raja", role: "II IT", quote: "Practising in the built-in editor with hidden test cases got me ready for my placement coding round." },
  { name: "Harini Lakshmi", role: "II AI&DS", quote: "I like that every attempt is saved. I can open any old quiz and see exactly where I lost marks." },
];

const SNIPPET = [
  [["text-violet-soft", "def "], ["text-electric-light", "two_sum"], ["text-ink-300", "(nums, target):"]],
  [["text-ink-300", "    seen = {}"]],
  [["text-violet-soft", "    for "], ["text-ink-300", "i, n "], ["text-violet-soft", "in "], ["text-electric-light", "enumerate"], ["text-ink-300", "(nums):"]],
  [["text-violet-soft", "        if "], ["text-ink-300", "target - n "], ["text-violet-soft", "in "], ["text-ink-300", "seen:"]],
  [["text-violet-soft", "            return "], ["text-ink-300", "[seen[target - n], i]"]],
  [["text-ink-300", "        seen[n] = i"]],
];

const STATUS_TONE = { upcoming: "upcoming", live: "live", completed: "completed" };
const STATUS_ORDER = { live: 0, upcoming: 1, completed: 2 };

// Demo Quiz and Gallery used to be sections students had to scroll to on
// this page (with a hash-anchored "Demo Quiz" nav link) — they now live at
// their own routes (/demo-quiz and /gallery), so Home only teases them with
// a short link out instead of embedding the live data here.
function ExploreMoreCTA() {
  return (
    <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Link
        to="/demo-quiz"
        className="glass-card group flex items-center justify-between gap-4 p-6 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <div className="icon-tile h-11 w-11">
            <Sparkles className="h-5 w-5 text-electric-light" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-ink-100">Try the Demo Quiz</p>
            <p className="mt-0.5 text-xs text-ink-500">See live scoring and timers in action</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-1 group-hover:text-electric-light" />
      </Link>
      <Link
        to="/gallery"
        className="glass-card group flex items-center justify-between gap-4 p-6 transition-all hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <div className="icon-tile h-11 w-11">
            <Images className="h-5 w-5 text-electric-light" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-ink-100">Browse the Gallery</p>
            <p className="mt-0.5 text-xs text-ink-500">Photos and videos from Eduverse events</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-1 group-hover:text-electric-light" />
      </Link>
    </div>
  );
}

function QuizPreview() {
  // null while loading; real quizzes win, sample quizzes fill in only when there are none.
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    const showSample = () => {
      if (alive) setState(DEMO_ENABLED ? { quizzes: demoQuizzes(), demo: true } : { quizzes: [], demo: false });
    };
    apiFetch("/quizzes")
      .then((data) => {
        const list = data.quizzes || [];
        if (!alive) return;
        if (list.length === 0) showSample();
        else setState({ quizzes: list, demo: false });
      })
      .catch(showSample);
    return () => {
      alive = false;
    };
  }, []);

  if (state && state.quizzes.length === 0) return null;

  const picked = state
    ? [...state.quizzes].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)).slice(0, 3)
    : [];

  return (
    <section className="mt-20" aria-labelledby="quiz-preview-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="quiz-preview-title" className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold text-ink-100">
            Happening on Eduverse {state?.demo && <DemoChip />}
          </h2>
          <p className="mt-1 text-sm text-ink-400">Live now, opening soon, and recently finished.</p>
        </div>
        <Link to="/quizzes" className="inline-flex items-center gap-1.5 text-sm font-medium text-electric-light transition-colors hover:text-ink-100">
          See all quizzes <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {!state
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)
          : picked.map((q) => (
              <Link key={q.id} to="/quizzes" className="glass-card group flex flex-col p-5 transition-transform hover:-translate-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-semibold leading-snug text-ink-100">{q.title}</h3>
                  <Badge tone={STATUS_TONE[q.status] || "upcoming"} dot={q.status === "live"}>
                    {q.status}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-ink-400">{q.description || "No description provided."}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-ink-400">
                  <span className="flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> {q.questionCount} Qs</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {q.durationMinutes}m</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {q.participantCount}</span>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}

function EditorPreview() {
  return (
    <div className="glass-card overflow-hidden" aria-label="Code editor preview">
      <div className="flex items-center justify-between border-b hairline px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-coral/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-mint/80" />
        </div>
        <span className="font-mono text-[11px] text-ink-400">two_sum.py</span>
        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-ink-300">Python 3</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6">
        {SNIPPET.map((line, i) => (
          <div key={i} className="flex gap-4">
            <span className="w-4 select-none text-right text-ink-700">{i + 1}</span>
            <code>
              {line.map(([tone, text], j) => (
                <span key={j} className={tone}>{text}</span>
              ))}
            </code>
          </div>
        ))}
      </pre>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t hairline bg-mint/[0.06] px-4 py-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-mint">
          <CheckCircle2 className="h-4 w-4" /> 5 of 5 hidden tests passed
        </span>
        <span className="font-mono text-ink-400">runtime 38 ms</span>
      </div>
    </div>
  );
}

function TopPerformers() {
  if (!DEMO_ENABLED) return null;
  const rows = demoLeaderboard("demo-quiz-1").leaderboard.slice(0, 5);
  const tone = ["text-amber", "text-ink-200", "text-[#C08A55]"];
  return (
    <section className="mt-20 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start" aria-labelledby="top-title">
      <div>
        <h2 id="top-title" className="flex flex-wrap items-center gap-3 font-display text-2xl font-semibold text-ink-100">
          Climb the leaderboard <DemoChip />
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-400">
          Every quiz has its own ranking by score, then by time taken. Faster, cleaner attempts rise to the top.
        </p>
        <Link to="/leaderboard/demo-quiz-1" className="btn-glass mt-6">
          View a sample leaderboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="glass-card divide-y divide-white/[0.06] overflow-hidden">
        {rows.map((r) => (
          <div key={r.registerNumber} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center text-xs font-semibold ${r.rank <= 3 ? tone[r.rank - 1] : "text-ink-400"}`}>
                {r.rank <= 3 ? <Medal className="h-5 w-5" /> : r.rank}
              </span>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-electric to-violet text-[11px] font-semibold text-void">
                {demoInitials(r.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-100">{r.name}</p>
                <p className="truncate text-xs text-ink-400">{r.registerNumber}</p>
              </div>
            </div>
            <span className="font-tabular text-sm font-semibold text-mint">{r.score} pts</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Testimonials() {
  if (!DEMO_ENABLED) return null;
  return (
    <section className="mt-20" aria-labelledby="voices-title">
      <h2 id="voices-title" className="mb-6 flex flex-wrap items-center gap-3 font-display text-2xl font-semibold text-ink-100">
        What students say <DemoChip />
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className="glass-card flex flex-col gap-4 p-6">
            <Quote className="h-5 w-5 text-violet-soft" aria-hidden="true" />
            <blockquote className="flex-1 text-sm leading-relaxed text-ink-200">{t.quote}</blockquote>
            <figcaption className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-electric to-violet text-[11px] font-semibold text-void">
                {demoInitials(t.name)}
              </div>
              <div>
                <p className="text-sm font-medium text-ink-100">{t.name}</p>
                <p className="text-xs text-ink-400">{t.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function Landing() {
  const { isAuthenticated, student } = useStudentAccountAuth();
  // The "Next / Next / Next" welcome tour now lives only here, on the
  // Landing Page, shown once on a visitor's first visit — it no longer
  // appears on the Quizzes tab.
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    setShowTutorial(!hasSeenStudentTutorial());
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      {showTutorial && <StudentTutorial onFinish={() => setShowTutorial(false)} />}
      {/* Hero */}
      <div className="glass-panel relative overflow-hidden p-8 sm:p-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-electric/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-violet/25 blur-3xl" />
        <div className="relative flex flex-col items-start gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="page-enter mb-5">
              <Logo size="lg" />
            </div>
            <span className="page-enter chip">
              <Sparkles className="h-3 w-3" /> College coding club
            </span>
            <h1 className="page-enter-2 mt-4 font-display text-4xl font-semibold leading-[1.08] text-ink-100 sm:text-5xl lg:text-6xl">
              Learn to code. Compete live. <span className="text-gradient">Prove it.</span>
            </h1>
            <p className="page-enter-2 mt-5 max-w-lg text-sm leading-relaxed text-ink-400 sm:text-base">
              Your college's home for quizzes, programming practice and assessments. Join live quizzes
              with your class, sharpen your skills in the code editor, and track your rank on the
              leaderboard in real time.
            </p>

            <div className="page-enter-3 mt-8 flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn-neon px-6 py-3.5">
                  <LayoutDashboard className="h-4 w-4" /> Go to your Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="btn-neon px-6 py-3.5">
                    <UserPlus className="h-4 w-4" /> Sign up
                  </Link>
                  <Link to="/signin" className="btn-glass px-6 py-3.5">
                    <LogIn className="h-4 w-4" /> Sign in
                  </Link>
                </>
              )}
              <Link
                to="/quizzes"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-3.5 text-sm font-medium text-ink-400 transition-colors hover:text-ink-100"
              >
                Browse quizzes <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {isAuthenticated && student?.name && (
              <p className="mt-3 text-xs text-ink-600">Signed in as {student.name}</p>
            )}
          </div>

          <div className="page-enter-3 glass-card w-full max-w-xs shrink-0 space-y-4 p-5 shadow-glow">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-[11px] uppercase tracking-wide text-ink-500">{s.label}</p>
                <p className="mt-0.5 text-sm font-medium text-ink-100">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Numbers */}
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {NUMBERS.map((n) => (
          <div key={n.label} className="glass-card px-5 py-4 text-center">
            <dd className="font-display text-3xl font-semibold text-gradient font-tabular">{n.value}</dd>
            <dt className="mt-1 text-xs text-ink-400">{n.label}</dt>
          </div>
        ))}
      </dl>

      {/* About */}
      <div className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink-100 sm:text-3xl">About Eduverse</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            We're a student-run community for anyone who wants to get better at programming, from
            first-timers writing their first loop to seniors prepping for placement rounds. Through the
            year we run live quiz contests, hands-on programming practice and timed assessments, all in
            one place, with real-time results so you always know where you stand.
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm text-ink-400">
            <Users className="h-4 w-4 flex-none text-electric-light" />
            Open to every department, every year. No prior experience required.
          </div>
        </div>
        <EditorPreview />
      </div>

      {/* Features */}
      <h2 className="mt-20 mb-6 font-display text-2xl font-semibold text-ink-100 sm:text-3xl">What you get</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="glass-card hover-lift flex flex-col gap-3 p-5 transition-transform hover:-translate-y-1">
            <div className="icon-tile h-11 w-11">
              <f.icon className="h-5 w-5 text-electric-light" strokeWidth={2} />
            </div>
            <p className="font-display text-sm font-semibold text-ink-100">{f.title}</p>
            <p className="text-xs leading-relaxed text-ink-400">{f.body}</p>
          </div>
        ))}
      </div>

      <QuizPreview />

      {/* How it works: a real sequence, so the numbers carry meaning */}
      <section className="mt-20" aria-labelledby="steps-title">
        <h2 id="steps-title" className="mb-6 font-display text-2xl font-semibold text-ink-100 sm:text-3xl">How it works</h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="glass-card flex gap-4 p-5">
              <span className="icon-tile h-10 w-10 shrink-0 font-display text-sm font-semibold text-electric-light">{i + 1}</span>
              <div>
                <p className="font-display text-sm font-semibold text-ink-100">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <TopPerformers />
      <Testimonials />

      <ExploreMoreCTA />

      {/* CTA */}
      {!isAuthenticated && (
        <div className="glass-panel relative mt-16 overflow-hidden p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-electric/15 via-transparent to-violet/15" />
          <div className="relative">
            <h2 className="font-display text-2xl font-semibold text-ink-100 sm:text-3xl">Ready to get started?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
              Create your account with your register number to unlock your personal Dashboard.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup" className="btn-neon px-6 py-3">
                <UserPlus className="h-4 w-4" /> Create your account
              </Link>
              <Link to="/signin" className="btn-glass px-6 py-3">
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
