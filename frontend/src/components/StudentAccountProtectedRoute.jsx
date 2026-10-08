import { Navigate, useLocation } from "react-router-dom";
import { useStudentAccountAuth } from "../lib/studentAccountAuth";

// Guards every signed-in-only student route. On top of the existing
// "must be signed in" check, this now also forces Profile completion:
// Sign Up only collects Username/Email/Password, so Register Number and
// Mobile Number are still missing right after signing up. Until both are
// filled in, every route except /profile itself redirects there — the
// Dashboard (and anything else) only becomes reachable once the profile is
// complete.
export default function StudentAccountProtectedRoute({ children }) {
  const { isAuthenticated, profileComplete, role } = useStudentAccountAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }
  if (role === "mentor") return <Navigate to="/mentor/dashboard" replace />;
  if (!profileComplete && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace state={{ from: location, forceComplete: true }} />;
  }
  return children;
}
