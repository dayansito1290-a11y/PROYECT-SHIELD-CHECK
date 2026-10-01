import { api, isNetworkError, type ActivityItem } from "../api";
import type { Assignment, CostCenter, Novedad, Photo, User, Visit } from "../types";
import { cacheGet, cacheSet, enqueue, listLocalVisits, listOutbox, localVisitByServer, outboxFor, readLocalVisit, readOutbox, saveLocalVisit, type LocalVisit, type OutboxOp } from "./db";
import { mergedVisit, refreshPending, syncNow } from "./sync";

export type SaveResult = {
  visit: Visit;
  clientId: string;
  pending: boolean;
  stale: boolean;
};

async function loadOrCache<T>(key: string, fetcher: () => Promise<T>) {
  try {
    const value = await fetcher();
    await cacheSet(key, value);
    return value;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const cached = await cacheGet<T>(key);
    if (cached) return cached;
    throw error;
  }
}

export function loadAssignments() {
  return loadOrCache("assignments", () => api.assignments());
}

export function loadActivities() {
  return loadOrCache("activities", () => api.activities());
}

export function loadVisits() {
  return loadOrCache("visits", () => api.visits());
}

export function loadSupervisors() {
  return loadOrCache("supervisors", () => api.supervisors());
}

export async function unsyncedVisits() {
  const [locals, ops] = await Promise.all([listLocalVisits(), listOutbox()]);
  const pending = new Set(ops.map((op) => op.clientVisitId));
  return locals.filter((row) => pending.has(row.clientId) && row.serverId == null);
}

export async function serversWaitingSync() {
  const [locals, ops] = await Promise.all([listLocalVisits(), listOutbox()]);
  const pending = new Set(ops.map((op) => op.clientVisitId));
  return new Set(locals.filter((row) => row.serverId != null && pending.has(row.clientId)).map((row) => row.serverId as number));
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlmb = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return Math.round(2 * radius * Math.asin(Math.sqrt(a)) * 10) / 10;
}

function buildVisit(input: {
  clientId: string;
  user: User;
  center: CostCenter;
  assignmentId?: number;
  lat: number;
  lng: number;
  locationNote: string;
  recordedAt: string;
  activities: ActivityItem[];
}): Visit {
  const distance = distanceMeters(input.lat, input.lng, input.center.lat, input.center.lng);
  return {
    id: 0,
    client_id: input.clientId,
    status: "en_curso",
    started_at: input.recordedAt,
    ended_at: null,
    check_lat: input.lat,
    check_lng: input.lng,
    distance_m: distance,
    location_valid: distance <= input.center.radius_m,
    location_note: input.locationNote,
    summary: "",
    cost_center: input.center,
    supervisor: input.user,
    checks: input.activities.map((activity) => ({
      id: activity.id,
      activity_id: activity.id,
      name: activity.name,
      description: activity.description,
      result: "pendiente" as const,
      notes: "",
    })),
    photos: [],
    novedades: [],
  };
}

async function store(clientId: string, serverId: number | null, visit: Visit) {
  const entry: LocalVisit = { clientId, serverId, updatedAt: new Date().toISOString(), visit: { ...visit, client_id: clientId } };
  await saveLocalVisit(entry);
  return entry.visit;
}

function sameCheck(visit: Visit, activityId: number, result: string, notes: string) {
  const check = visit.checks.find((item) => item.activity_id === activityId);
  return !!check && check.result === result && check.notes === notes;
}

export async function beginVisit(input: {
  user: User;
  center: CostCenter;
  assignment: Assignment | null;
  lat: number;
  lng: number;
  locationNote: string;
  activities: ActivityItem[];
}): Promise<SaveResult> {
  if (input.activities.length === 0) {
    throw new Error("No hay actividades guardadas en el dispositivo. Conéctate una vez para descargarlas.");
  }
  const clientId = crypto.randomUUID();
  const recordedAt = new Date().toISOString();
  const local = buildVisit({
    clientId,
    user: input.user,
    center: input.center,
    lat: input.lat,
    lng: input.lng,
    locationNote: input.locationNote,
    recordedAt,
    activities: input.activities,
  });
  const payload = {
    cost_center_id: input.center.id,
    lat: input.lat,
    lng: input.lng,
    location_note: input.locationNote,
    assignment_id: input.assignment?.id,
    client_id: clientId,
    recorded_at: recordedAt,
  };
  if (navigator.onLine) {
    try {
      const created = await api.startVisit(payload);
      const visit = await store(clientId, created.id, created);
      return { visit, clientId, pending: false, stale: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await store(clientId, null, local);
  await enqueue({
    id: crypto.randomUUID(),
    kind: "start",
    clientVisitId: clientId,
    serverVisitId: null,
    recordedAt,
    attempts: 0,
    lastError: "",
    nextAttemptAt: 0,
    payload,
  });
  await refreshPending();
  return { visit: local, clientId, pending: true, stale: false };
}

async function queue(op: OutboxOp) {
  await enqueue(op);
  await refreshPending();
  if (navigator.onLine) void syncNow();
}

export async function saveCheck(clientId: string, visit: Visit, activityId: number, result: Visit["checks"][number]["result"], notes: string): Promise<SaveResult> {
  const recordedAt = new Date().toISOString();
  const optimistic: Visit = {
    ...visit,
    checks: visit.checks.map((check) => (check.activity_id === activityId ? { ...check, result, notes } : check)),
  };
  const op: OutboxOp = {
    id: crypto.randomUUID(),
    kind: "check",
    clientVisitId: clientId,
    serverVisitId: visit.id || null,
    recordedAt,
    attempts: 0,
    lastError: "",
    nextAttemptAt: 0,
    payload: { activity_id: activityId, result, notes },
  };
  if (visit.id && navigator.onLine) {
    try {
      const updated = await api.updateActivity(visit.id, activityId, result, notes, recordedAt);
      const merged = await mergedVisit(clientId, updated);
      return { visit: merged, clientId, pending: (await listOutbox()).some((item) => item.clientVisitId === clientId), stale: !sameCheck(updated, activityId, result, notes) };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await store(clientId, visit.id || null, optimistic);
  await queue(op);
  return { visit: optimistic, clientId, pending: true, stale: false };
}

export async function saveNovedad(clientId: string, visit: Visit, input: { title: string; description: string; severity: string }): Promise<SaveResult> {
  const recordedAt = new Date().toISOString();
  const opId = crypto.randomUUID();
  const novedad: Novedad = {
    id: 0,
    client_id: opId,
    title: input.title,
    description: input.description,
    severity: input.severity as Novedad["severity"],
    status: "pendiente",
    created_at: recordedAt,
    visit_id: visit.id || null,
    cost_center: visit.cost_center,
    supervisor: visit.supervisor,
  };
  const optimistic: Visit = { ...visit, novedades: [...visit.novedades, novedad] };
  const op: OutboxOp = {
    id: opId,
    kind: "novedad",
    clientVisitId: clientId,
    serverVisitId: visit.id || null,
    recordedAt,
    attempts: 0,
    lastError: "",
    nextAttemptAt: 0,
    payload: { title: input.title, description: input.description, severity: input.severity, novedad },
  };
  if (visit.id && navigator.onLine) {
    try {
      const updated = await api.createNovedad(visit.id, { ...input, client_id: opId, recorded_at: recordedAt });
      const merged = await mergedVisit(clientId, updated);
      return { visit: merged, clientId, pending: false, stale: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await store(clientId, visit.id || null, optimistic);
  await queue(op);
  return { visit: optimistic, clientId, pending: true, stale: false };
}

export async function savePhoto(clientId: string, visit: Visit, file: File, caption: string): Promise<SaveResult> {
  const recordedAt = new Date().toISOString();
  const opId = crypto.randomUUID();
  const photo: Photo = { id: 0, client_id: opId, url: `idb:${opId}`, caption, created_at: recordedAt };
  const optimistic: Visit = { ...visit, photos: [...visit.photos, photo] };
  const op: OutboxOp = {
    id: opId,
    kind: "photo",
    clientVisitId: clientId,
    serverVisitId: visit.id || null,
    recordedAt,
    attempts: 0,
    lastError: "",
    nextAttemptAt: 0,
    payload: { caption, filename: file.name || "evidencia.jpg", photo },
    blob: file,
  };
  if (visit.id && navigator.onLine) {
    try {
      const updated = await api.uploadPhoto(visit.id, file, caption, opId, recordedAt);
      const merged = await mergedVisit(clientId, updated);
      return { visit: merged, clientId, pending: false, stale: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await store(clientId, visit.id || null, optimistic);
  await queue(op);
  return { visit: optimistic, clientId, pending: true, stale: false };
}

export async function saveClose(clientId: string, visit: Visit, summary: string): Promise<SaveResult> {
  const recordedAt = new Date().toISOString();
  const optimistic: Visit = { ...visit, status: "completada", summary, ended_at: recordedAt };
  const op: OutboxOp = {
    id: crypto.randomUUID(),
    kind: "close",
    clientVisitId: clientId,
    serverVisitId: visit.id || null,
    recordedAt,
    attempts: 0,
    lastError: "",
    nextAttemptAt: 0,
    payload: { summary },
  };
  if (visit.id && navigator.onLine) {
    try {
      const updated = await api.closeVisit(visit.id, summary, recordedAt);
      const merged = await mergedVisit(clientId, updated);
      return { visit: merged, clientId, pending: false, stale: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
    }
  }
  await store(clientId, visit.id || null, optimistic);
  await queue(op);
  return { visit: optimistic, clientId, pending: true, stale: false };
}

export async function visitPending(clientId: string) {
  return (await outboxFor(clientId)).length;
}

export async function openLocal(clientId: string) {
  const row = await readLocalVisit(clientId);
  return row ?? null;
}

export async function openServerVisit(id: number) {
  try {
    const visit = await api.visit(id);
    const known = await localVisitByServer(id);
    const clientId = known?.clientId || visit.client_id || crypto.randomUUID();
    const pending = (await listOutbox()).some((op) => op.clientVisitId === clientId);
    const merged = pending ? await mergedVisit(clientId, visit) : visit;
    if (!pending) await store(clientId, visit.id, visit);
    return { visit: merged, clientId, offline: false as const };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const known = await localVisitByServer(id);
    if (!known) throw new Error("Esta visita no está guardada en el dispositivo. Conéctate para abrirla.");
    return { visit: known.visit, clientId: known.clientId, offline: true as const };
  }
}

export async function readPhotoBlob(opId: string) {
  const op = await readOutbox(opId);
  return op?.blob ?? null;
}

export async function ensureReferenceData() {
  await Promise.allSettled([loadAssignments(), loadActivities(), loadVisits()]);
}
