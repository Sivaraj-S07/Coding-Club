import { Navigate, useLocation } from "react-router-dom";
import { useAdminAuth } from "../lib/adminAuth";

export default function AdminProtectedRoute({ children }) {
  const { isAuthenticated } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/admin" replace state={{ from: location }} />;
  }
  return children;
}
