import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";

const STORAGE_KEY = "quizapp_student_account_token";
const STUDENT_INFO_KEY = "quizapp_student_account_info";

const StudentAccountAuthContext = createContext(null);

export function StudentAccountAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [student, setStudent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STUDENT_INFO_KEY) || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  }, [token]);

  useEffect(() => {
    if (student) localStorage.setItem(STUDENT_INFO_KEY, JSON.stringify(student));
    else localStorage.removeItem(STUDENT_INFO_KEY);
  }, [student]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    apiFetch("/teams/account", { token, signal: controller.signal }).then(data => setStudent(prev => ({...prev, ...data.student}))).catch(error => {
      if (error.status === 401 || error.status === 403) { setToken(null); setStudent(null); }
    });
    return () => controller.abort();
  }, [token]);

  /** Sign Up: username, email, strong password only. Everything else is collected during forced Profile completion. */
  const signUp = useCallback(async ({ username, email, password, confirmPassword, role = "student" }) => {
    const data = await apiFetch(role === "mentor" ? "/teams/mentors/register" : "/students/register", {
      method: "POST",
      body: { username, email, password, confirmPassword },
    });
    setToken(data.token);
    setStudent(data.student);
    return data;
  }, []);

  /** Sign In: email + password. */
  const signIn = useCallback(async (email, password, role = "student") => {
    const data = await apiFetch(role === "mentor" ? "/teams/mentors/signin" : "/students/signin", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.token);
    setStudent(data.student);
    return data;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setStudent(null);
  }, []);

  /**
   * Profile: update username / bio / photo / department / section / mobile
   * number / batch, and — once, during forced Profile completion — register
   * number. Once a register number has been saved it is permanently fixed;
   * the backend rejects any further attempt to change it.
   */
  const updateProfile = useCallback(
    async ({ username, bio, avatarUrl, department, section, mobileNumber, batch, registerNumber } = {}) => {
      const body = {};
      if (username !== undefined) body.username = username;
      if (bio !== undefined) body.bio = bio;
      if (avatarUrl !== undefined) body.avatarUrl = avatarUrl;
      if (department !== undefined) body.department = department;
      if (section !== undefined) body.section = section;
      if (mobileNumber !== undefined) body.mobileNumber = mobileNumber;
      if (batch !== undefined) body.batch = batch;
      if (registerNumber !== undefined) body.registerNumber = registerNumber;
      const data = await apiFetch("/students/account", { method: "PUT", token, body });
      setStudent((prev) => ({ ...prev, ...data.student }));
      return data;
    },
    [token]
  );

  /**
   * True once Register Number and Mobile Number have both been filled in.
   * Prefers the server-computed flag (present on every fresh Sign
   * Up/Sign In/Profile response); falls back to deriving it from the cached
   * student object for a session restored from localStorage before this
   * feature existed.
   */
  const profileComplete = student
    ? student.profileComplete !== undefined
      ? Boolean(student.profileComplete)
      : Boolean(student.registerNumber) && Boolean(student.mobileNumber)
    : false;

  /** Profile: change password (requires current password). */
  const changePassword = useCallback(
    async ({ currentPassword, newPassword, confirmPassword }) => {
      return apiFetch("/students/account/password", {
        method: "PUT",
        token,
        body: { currentPassword, newPassword, confirmPassword },
      });
    },
    [token]
  );

  return (
    <StudentAccountAuthContext.Provider
      value={{
        token,
        student,
        signUp,
        signIn,
        signOut,
        updateProfile,
        changePassword,
        isAuthenticated: !!token,
        profileComplete,
        role: student?.role || "student",
      }}
    >
      {children}
    </StudentAccountAuthContext.Provider>
  );
}

export function useStudentAccountAuth() {
  const ctx = useContext(StudentAccountAuthContext);
  if (!ctx) throw new Error("useStudentAccountAuth must be used within StudentAccountAuthProvider");
  return ctx;
}
