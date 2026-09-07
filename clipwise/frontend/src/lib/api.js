import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer fallback (in case cookies don't flow on some browsers/preview)
export function setBearer(token) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    localStorage.setItem("cw_token", token);
  } else {
    delete api.defaults.headers.common["Authorization"];
    localStorage.removeItem("cw_token");
  }
}
const saved = typeof window !== "undefined" ? localStorage.getItem("cw_token") : null;
if (saved) api.defaults.headers.common["Authorization"] = `Bearer ${saved}`;

export function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("cw_token") : null;
}

/**
 * Append the bearer token as a query parameter.
 * Needed for <video src>, <img src> and <a href> downloads, which cannot carry
 * an Authorization header. The API accepts ?token= on those GET endpoints.
 */
export function withToken(url) {
  const token = getToken();
  if (!token || !url) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

export function formatError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
