import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";

const STORAGE_KEY = "quizapp_admin_token";
const ADMIN_INFO_KEY = "quizapp_admin_info";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [admin, setAdmin] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(ADMIN_INFO_KEY) || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  }, [token]);

  useEffect(() => {
    if (admin) localStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(admin));
    else localStorage.removeItem(ADMIN_INFO_KEY);
  }, [admin]);

  const login = useCallback(async (email, password) => {
    const data = await apiFetch("/admin/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    setAdmin(data.admin);
    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ token, admin, login, logout, isAuthenticated: !!token }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
