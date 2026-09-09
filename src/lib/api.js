import axios from "axios";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

const TOKENS_KEY = "geowork_tokens";
const USER_CACHE_KEY = "geowork_cached_user";

export function getTokens() {
  const raw = localStorage.getItem(TOKENS_KEY) || sessionStorage.getItem(TOKENS_KEY);
  return raw ? JSON.parse(raw) : null;
}

/**
 * remember=true (default) persists across browser restarts (localStorage).
 * remember=false keeps the session only as long as the tab stays open
 * (sessionStorage) — this is what the login screen's "Remember me" toggles.
 */
export function setTokens(tokens, remember = true) {
  localStorage.removeItem(TOKENS_KEY);
  sessionStorage.removeItem(TOKENS_KEY);
  if (tokens) {
    (remember ? localStorage : sessionStorage).setItem(TOKENS_KEY, JSON.stringify(tokens));
  } else {
    // Tokens gone means the cached profile is stale too — never leave it
    // behind for a subsequent login on the same browser to pick up.
    localStorage.removeItem(USER_CACHE_KEY);
    sessionStorage.removeItem(USER_CACHE_KEY);
  }
}

/**
 * Best-effort last-known profile, used only so a page reload with no
 * network connectivity doesn't force a login the user has no reason to
 * expect (V1.1: "do not log out simply because of temporary network
 * loss"). Never authoritative — every real permission check happens
 * server-side on each request.
 */
export function getCachedUser() {
  const raw = localStorage.getItem(USER_CACHE_KEY) || sessionStorage.getItem(USER_CACHE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setCachedUser(user, remember = true) {
  localStorage.removeItem(USER_CACHE_KEY);
  sessionStorage.removeItem(USER_CACHE_KEY);
  if (user) {
    (remember ? localStorage : sessionStorage).setItem(USER_CACHE_KEY, JSON.stringify(user));
  }
}

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const tokens = getTokens();
  if (tokens?.access) {
    config.headers.Authorization = `Bearer ${tokens.access}`;
  }
  return config;
});

let refreshInFlight = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const isAuthRoute = config?.url?.includes("/auth/login") || config?.url?.includes("/auth/token/refresh");

    if (response?.status === 401 && !config._retried && !isAuthRoute) {
      const tokens = getTokens();
      if (!tokens?.refresh) {
        setTokens(null);
        redirectToLogin();
        return Promise.reject(error);
      }
      config._retried = true;
      try {
        if (!refreshInFlight) {
          refreshInFlight = axios
            .post(`${BASE_URL}/auth/token/refresh/`, { refresh: tokens.refresh })
            .then((r) => r.data)
            .finally(() => {
              refreshInFlight = null;
            });
        }
        const data = await refreshInFlight;
        // ROTATE_REFRESH_TOKENS=True on the backend: every refresh call
        // blacklists the old refresh token and issues a new one. The old
        // React code only ever stored the new `access` token and kept the
        // now-blacklisted refresh token — harmless for the first refresh,
        // but the *second* time the access token expired, refreshing with
        // that stale refresh token would fail and force a login the user
        // had no reason to expect ("logged out randomly"). Must always
        // persist whatever refresh token comes back, falling back to the
        // existing one only if the backend didn't rotate for some reason.
        const remembered = localStorage.getItem(TOKENS_KEY) != null;
        setTokens({ access: data.access, refresh: data.refresh || tokens.refresh }, remembered);
        config.headers.Authorization = `Bearer ${data.access}`;
        return api(config);
      } catch (refreshError) {
        setTokens(null);
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

function redirectToLogin() {
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

/** Pull the first useful message out of a DRF error response. */
export function apiErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  const firstKey = Object.keys(data)[0];
  if (firstKey) {
    const val = data[firstKey];
    const msg = Array.isArray(val) ? val[0] : val;
    return firstKey === "non_field_errors" || firstKey === "detail" ? msg : `${firstKey}: ${msg}`;
  }
  return fallback;
}

export default api;
