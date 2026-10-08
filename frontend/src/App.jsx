import Teams from "./pages/student/Teams";
import MentorDashboard from "./pages/mentor/Dashboard";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AdminAuthProvider } from "./lib/adminAuth";
import { StudentAccountAuthProvider } from "./lib/studentAccountAuth";
import { AccessibilityProvider, useAccessibility } from "./lib/accessibility";
import KeyboardShortcuts from "./components/ai/KeyboardShortcuts";
import StudentNavbar from "./components/StudentNavbar";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import StudentProtectedRoute from "./components/StudentProtectedRoute";
import StudentAccountProtectedRoute from "./components/StudentAccountProtectedRoute";

import Landing from "./pages/student/Landing";
import DemoQuiz from "./pages/student/DemoQuiz";
import Gallery from "./pages/student/Gallery";
import SignUp from "./pages/student/SignUp";
import SignIn from "./pages/student/SignIn";
import QuizLogin from "./pages/student/QuizLogin";
import QuizRunner from "./pages/student/QuizRunner";
import Result from "./pages/student/Result";
import Leaderboard from "./pages/student/Leaderboard";
import Quizzes from "./pages/student/Quizzes";
import Playground from "./pages/student/Playground";
import Dashboard from "./pages/student/Dashboard";
import Profile from "./pages/student/Profile";
import AccessibilityCenter from "./pages/student/AccessibilityCenter";
import Learn from "./pages/student/Learn";
import Practice from "./pages/student/Practice";
import Lesson from "./pages/student/Lesson";
import Tutor from "./pages/student/Tutor";

// Admin portal is code-split: students never download it, so the public pages
// boot from a much smaller bundle.
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminQuizzes = lazy(() => import("./pages/admin/AdminQuizzes"));
const AdminQuizBuilder = lazy(() => import("./pages/admin/AdminQuizBuilder"));
const AdminResults = lazy(() => import("./pages/admin/AdminResults"));
const AdminLive = lazy(() => import("./pages/admin/AdminLive"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminLandingQuizzes = lazy(() => import("./pages/admin/AdminLandingQuizzes"));
const AdminLandingMedia = lazy(() => import("./pages/admin/AdminLandingMedia"));
const AdminUserAccounts = lazy(() => import("./pages/admin/AdminUserAccounts"));
const AdminGuestAccounts = lazy(() => import("./pages/admin/AdminGuestAccounts"));
const AdminLeaderboard = lazy(() => import("./pages/admin/AdminLeaderboard"));
const AdminSecurityLog = lazy(() => import("./pages/admin/AdminSecurityLog"));
const AdminLearningInsights = lazy(() => import("./pages/admin/AdminLearningInsights"));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-300">
      Loading...
    </div>
  );
}

// The skip link jumps keyboard / screen-reader users past the navbar. The
// target is a zero-size anchor (not a <main> wrapper) so no page layout changes.
function StudentShell({ children }) {
  const { t } = useAccessibility();
  return (
    <>
      <a href="#main-content" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main-content")?.focus(); }}>
        {t("nav.skip")}
      </a>
      <StudentNavbar />
      <span id="main-content" tabIndex={-1} className="block h-0 w-0 outline-none" aria-hidden="false" />
      {children}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AdminAuthProvider>
        <StudentAccountAuthProvider>
          <AccessibilityProvider>
          <BrowserRouter>
            <KeyboardShortcuts />
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<StudentShell><Landing /></StudentShell>} />
              <Route path="/demo-quiz" element={<StudentShell><DemoQuiz /></StudentShell>} />
              <Route path="/gallery" element={<StudentShell><Gallery /></StudentShell>} />
              <Route path="/signup" element={<StudentShell><SignUp /></StudentShell>} />
              <Route path="/signin" element={<StudentShell><SignIn /></StudentShell>} />
              <Route path="/quizzes" element={<StudentShell><Quizzes /></StudentShell>} />
              <Route path="/programming" element={<StudentShell><Playground /></StudentShell>} />
              <Route
                path="/dashboard"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Dashboard /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Profile /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route path="/teams" element={<StudentAccountProtectedRoute><StudentShell><Teams /></StudentShell></StudentAccountProtectedRoute>} />
              <Route path="/mentor/dashboard" element={<StudentShell><MentorDashboard /></StudentShell>} />
              <Route path="/accessibility" element={<StudentShell><AccessibilityCenter /></StudentShell>} />
              <Route
                path="/learn"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Learn /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/learn/practice"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Practice /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/learn/lessons/:topicId"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Lesson /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/tutor"
                element={
                  <StudentAccountProtectedRoute>
                    <StudentShell><Tutor /></StudentShell>
                  </StudentAccountProtectedRoute>
                }
              />
              <Route
                path="/login/:quizId"
                element={
                  <StudentShell><QuizLogin /></StudentShell>
                }
              />
              <Route
                path="/quiz/:quizId"
                element={
                  <StudentProtectedRoute>
                    <QuizRunner />
                  </StudentProtectedRoute>
                }
              />
              <Route path="/result/:quizId" element={<StudentShell><Result /></StudentShell>} />
              <Route path="/leaderboard/:quizId" element={<StudentShell><Leaderboard /></StudentShell>} />

              <Route path="/admin" element={<AdminLogin />} />
              <Route
                path="/admin/dashboard"
                element={
                  <AdminProtectedRoute>
                    <AdminDashboard />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/quizzes"
                element={
                  <AdminProtectedRoute>
                    <AdminQuizzes />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/quizzes/:quizId"
                element={
                  <AdminProtectedRoute>
                    <AdminQuizBuilder />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/landing-quizzes"
                element={
                  <AdminProtectedRoute>
                    <AdminLandingQuizzes />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/landing-quizzes/:quizId"
                element={
                  <AdminProtectedRoute>
                    <AdminQuizBuilder />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/landing-media"
                element={
                  <AdminProtectedRoute>
                    <AdminLandingMedia />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/user-accounts"
                element={
                  <AdminProtectedRoute>
                    <AdminUserAccounts />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/guest-accounts"
                element={
                  <AdminProtectedRoute>
                    <AdminGuestAccounts />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/results"
                element={
                  <AdminProtectedRoute>
                    <AdminResults />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/leaderboard"
                element={
                  <AdminProtectedRoute>
                    <AdminLeaderboard />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/live"
                element={
                  <AdminProtectedRoute>
                    <AdminLive />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/security-log"
                element={
                  <AdminProtectedRoute>
                    <AdminSecurityLog />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/learning-insights"
                element={
                  <AdminProtectedRoute>
                    <AdminLearningInsights />
                  </AdminProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminProtectedRoute>
                    <AdminSettings />
                  </AdminProtectedRoute>
                }
              />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </AccessibilityProvider>
        </StudentAccountAuthProvider>
      </AdminAuthProvider>
    </ToastProvider>
  );
}
