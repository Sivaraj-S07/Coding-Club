import { Navigate, useParams } from "react-router-dom";
import { getStudentSession } from "../lib/studentAuth";

export default function StudentProtectedRoute({ children }) {
  const { quizId } = useParams();
  const session = getStudentSession(quizId);

  if (!session?.token) {
    return <Navigate to={`/login/${quizId}`} replace />;
  }
  return children;
}
