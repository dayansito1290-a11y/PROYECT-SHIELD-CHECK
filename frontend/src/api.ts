import type { Assignment, CostCenter, Dashboard, Novedad, NovedadAlert, Report, Supervisor, User, Visit } from "./types";

const TOKEN_KEY = "sic_token";
const USER_KEY = "sic_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function cachedUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setCachedUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Sin conexión a Internet");
  }
  if (!response.ok) {
    let detail = "No se pudo completar la solicitud";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* respuesta vacía */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function isNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof Error && (error.message === "Sin conexión a Internet" || error.message === "Failed to fetch");
}

export type ActivityItem = { id: number; name: string; description: string };

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/api/auth/me"),
  centers: () => request<CostCenter[]>("/api/cost-centers"),
  createCenter: (payload: Omit<CostCenter, "id">) =>
    request<CostCenter>("/api/cost-centers", { method: "POST", body: JSON.stringify(payload) }),
  supervisors: () => request<Supervisor[]>("/api/supervisors"),
  createSupervisor: (payload: { name: string; email: string; password: string }) =>
    request<Supervisor>("/api/supervisors", { method: "POST", body: JSON.stringify(payload) }),
  reports: (start: string, end: string) => request<Report>(`/api/reports?start=${start}&end=${end}`),
  assignments: () => request<Assignment[]>("/api/assignments"),
  visits: () => request<Visit[]>("/api/visits"),
  visit: (id: number) => request<Visit>(`/api/visits/${id}`),
  activities: () => request<ActivityItem[]>("/api/activities"),
  startVisit: (payload: {
    cost_center_id: number;
    lat: number;
    lng: number;
    location_note: string;
    assignment_id?: number;
    client_id?: string;
    recorded_at?: string;
  }) => request<Visit>("/api/visits", { method: "POST", body: JSON.stringify(payload) }),
  updateCheck: (visitId: number, checkId: number, result: string, notes: string, recordedAt?: string) =>
    request<Visit>(`/api/visits/${visitId}/checks/${checkId}`, {
      method: "PATCH",
      body: JSON.stringify({ result, notes, recorded_at: recordedAt }),
    }),
  updateActivity: (visitId: number, activityId: number, result: string, notes: string, recordedAt: string) =>
    request<Visit>(`/api/visits/${visitId}/activities/${activityId}`, {
      method: "PATCH",
      body: JSON.stringify({ result, notes, recorded_at: recordedAt }),
    }),
  uploadPhoto: (visitId: number, file: File, caption: string, clientId?: string, recordedAt?: string) => {
    const body = new FormData();
    body.append("file", file);
    body.append("caption", caption);
    if (clientId) body.append("client_id", clientId);
    if (recordedAt) body.append("recorded_at", recordedAt);
    return request<Visit>(`/api/visits/${visitId}/photos`, { method: "POST", body });
  },
  createNovedad: (
    visitId: number,
    payload: { title: string; description: string; severity: string; client_id?: string; recorded_at?: string },
  ) =>
    request<Visit>(`/api/visits/${visitId}/novedades`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  closeVisit: (visitId: number, summary: string, recordedAt?: string) =>
    request<Visit>(`/api/visits/${visitId}/close`, {
      method: "POST",
      body: JSON.stringify({ summary, recorded_at: recordedAt }),
    }),
  novedades: (filters: {
    severity?: string;
    status?: string;
    supervisor_id?: string;
    cost_center_id?: string;
    start?: string;
    end?: string;
  } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return request<Novedad[]>(`/api/novedades${query ? `?${query}` : ""}`);
  },
  novedad: (id: number) => request<Novedad>(`/api/novedades/${id}`),
  novedadAlerts: () => request<NovedadAlert[]>("/api/novedades/alertas"),
  updateNovedad: (id: number, status: string) =>
    request<Novedad>(`/api/novedades/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  addFollowUp: (id: number, kind: "comentario" | "accion", body: string) =>
    request<Novedad>(`/api/novedades/${id}/seguimiento`, {
      method: "POST",
      body: JSON.stringify({ kind, body }),
    }),
  dashboard: () => request<Dashboard>("/api/dashboard"),
};

export function formatWhen(value: string | null) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function distanceLabel(meters: number | null) {
  if (meters == null) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
