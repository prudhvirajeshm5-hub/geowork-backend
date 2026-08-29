import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { getTokens, setTokens } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const tokens = getTokens();
    if (!tokens?.access) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me/");
      setUser(data);
    } catch {
      setTokens(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (phone, password, remember = true) => {
    const { data } = await api.post("/auth/login/", { phone, password });
    setTokens({ access: data.access, refresh: data.refresh }, remember);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    const tokens = getTokens();
    try {
      if (tokens?.refresh) await api.post("/auth/logout/", { refresh: tokens.refresh });
    } catch {
      // token already dead — fine, we're clearing it locally either way
    }
    setTokens(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/auth/me/");
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
