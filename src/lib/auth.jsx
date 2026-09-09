import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { getCachedUser, getTokens, setCachedUser, setTokens } from "./api";

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
    // Optimistic: show the cached profile immediately so a reload doesn't
    // bounce through a login-looking flash while /auth/me/ is in flight,
    // and so a genuine network outage (see catch below) has something to
    // fall back to instead of forcing a login.
    const cached = getCachedUser();
    if (cached) setUser(cached);

    try {
      const { data } = await api.get("/auth/me/");
      setUser(data);
      setCachedUser(data, localStorage.getItem("geowork_tokens") != null);
    } catch (error) {
      // V1.1 fix: this used to clear tokens and force a login on ANY
      // failure, including a plain network error with no server response
      // at all. `api`'s interceptor already attempts a silent refresh on a
      // real 401 and only lets it through if the refresh token itself was
      // rejected — so by the time we get here, `error.response` present
      // means "the server told us this session is genuinely invalid",
      // while no response at all just means "couldn't reach the server
      // right now". Only the former should log the user out.
      if (error?.response) {
        setTokens(null);
        setUser(null);
      } else if (!cached) {
        // No cached profile to fall back on and no way to confirm the
        // session either — leave tokens in place (don't force a login the
        // user didn't ask for) but there's nothing to show as `user` yet.
        setUser(null);
      }
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
    setCachedUser(data.user, remember);
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
    setCachedUser(data, localStorage.getItem("geowork_tokens") != null);
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
