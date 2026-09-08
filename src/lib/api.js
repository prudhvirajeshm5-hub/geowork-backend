import axios from "axios";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

const TOKENS_KEY = "geowork_tokens";

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
        // Refresh must not silently upgrade a session-only login into a persisted one.
        const remembered = localStorage.getItem(TOKENS_KEY) != null;
        setTokens({ ...tokens, access: data.access }, remembered);
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
