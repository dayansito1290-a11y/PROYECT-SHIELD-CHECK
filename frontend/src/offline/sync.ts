import { api, isNetworkError } from "../api";
import type { Novedad, Photo, Visit } from "../types";
import {
  listOutbox,
  outboxFor,
  pendingCount,
  readLocalVisit,
  removeOutbox,
  saveLocalVisit,
  saveOutbox,
  type OutboxOp,
} from "./db";

export type SyncStatus = {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastError: string;
  confirmation: string;
};

const listeners = new Set<(status: SyncStatus) => void>();
let status: SyncStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: 0,
  syncing: false,
  lastError: "",
  confirmation: "",
};
let running = false;

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

export function getSyncStatus() {
  return status;
}

export function subscribeSync(listener: (next: SyncStatus) => void) {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

const kindOrder: Record<OutboxOp["kind"], number> = {
  start: 0,
  check: 1,
  novedad: 2,
  photo: 3,
  close: 4,
};

function compareOps(left: OutboxOp, right: OutboxOp) {
  if (left.clientVisitId !== right.clientVisitId) return left.recordedAt.localeCompare(right.recordedAt);
  const kind = kindOrder[left.kind] - kindOrder[right.kind];
  if (kind !== 0) return kind;
  return left.recordedAt.localeCompare(right.recordedAt);
}

function overlay(server: Visit, ops: OutboxOp[], clientId: string): Visit {
  const visit: Visit = { ...server, client_id: server.client_id || clientId, checks: server.checks.map((check) => ({ ...check })), photos: [...server.photos], novedades: [...server.novedades] };
  for (const op of [...ops].sort(compareOps)) {
    if (op.kind === "check") {
      const activityId = Number(op.payload.activity_id);
      const check = visit.checks.find((item) => item.activity_id === activityId);
      if (check) {
        check.result = op.payload.result as Visit["checks"][number]["result"];
        check.notes = String(op.payload.notes ?? "");
      }
    }
    if (op.kind === "novedad" && !visit.novedades.some((item) => item.client_id === op.id)) {
      visit.novedades.push(op.payload.novedad as Novedad);
    }
    if (op.kind === "photo" && !visit.photos.some((item) => item.client_id === op.id)) {
      visit.photos.push(op.payload.photo as Photo);
    }
    if (op.kind === "close") {
      visit.status = "completada";
      visit.summary = String(op.payload.summary ?? "");
      visit.ended_at = op.recordedAt;
    }
  }
  return visit;
}

async function remember(clientId: string, serverVisit: Visit) {
  const pending = (await outboxFor(clientId)).filter((op) => op.kind !== "start");
  const local = await readLocalVisit(clientId);
  const merged = overlay(serverVisit, pending, clientId);
  await saveLocalVisit({
    clientId,
    serverId: serverVisit.id,
    updatedAt: new Date().toISOString(),
    visit: merged,
  });
  if (local?.serverId == null) {
    const ops = await outboxFor(clientId);
    for (const op of ops) {
      if (op.serverVisitId == null) {
        await saveOutbox({ ...op, serverVisitId: serverVisit.id });
      }
    }
  }
  return merged;
}

async function send(op: OutboxOp) {
  if (op.kind === "start") {
    return api.startVisit({
      cost_center_id: Number(op.payload.cost_center_id),
      lat: Number(op.payload.lat),
      lng: Number(op.payload.lng),
      location_note: String(op.payload.location_note ?? ""),
      assignment_id: op.payload.assignment_id == null ? undefined : Number(op.payload.assignment_id),
      client_id: op.clientVisitId,
      recorded_at: op.recordedAt,
    });
  }
  const visitId = op.serverVisitId;
  if (!visitId) throw new Error("La llegada todavía no está confirmada en el servidor");
  if (op.kind === "check") {
    return api.updateActivity(visitId, Number(op.payload.activity_id), String(op.payload.result), String(op.payload.notes ?? ""), op.recordedAt);
  }
  if (op.kind === "novedad") {
    return api.createNovedad(visitId, {
      title: String(op.payload.title),
      description: String(op.payload.description),
      severity: String(op.payload.severity),
      client_id: op.id,
      recorded_at: op.recordedAt,
    });
  }
  if (op.kind === "photo") {
    if (!op.blob) throw new Error("La fotografía ya no está en el dispositivo");
    const file = new File([op.blob], String(op.payload.filename ?? "evidencia.jpg"), { type: op.blob.type || "image/jpeg" });
    return api.uploadPhoto(visitId, file, String(op.payload.caption ?? ""), op.id, op.recordedAt);
  }
  return api.closeVisit(visitId, String(op.payload.summary ?? ""), op.recordedAt);
}

function backoff(attempts: number) {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
}

export async function refreshPending() {
  const pending = await pendingCount();
  emit({ pending, confirmation: pending > 0 ? "" : status.confirmation });
}

export async function syncNow() {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    emit({ online: false, pending: await pendingCount(), syncing: false });
    return;
  }
  running = true;
  let saved = 0;
  try {
    emit({ syncing: true, pending: await pendingCount() });
    while (true) {
      const ops = await listOutbox();
      const waitingStart = new Set(
        ops.filter((op) => op.kind === "start" && op.nextAttemptAt > Date.now()).map((op) => op.clientVisitId),
      );
      const next = ops
        .filter((op) => op.nextAttemptAt <= Date.now() && !waitingStart.has(op.clientVisitId))
        .sort(compareOps)[0];
      if (!next) break;
      if (next.kind !== "start" && !next.serverVisitId) {
        await saveOutbox({
          ...next,
          lastError: "Falta la llegada de esta visita",
          nextAttemptAt: Date.now() + backoff(next.attempts + 1),
          attempts: next.attempts + 1,
        });
        emit({ lastError: "Falta la llegada de esta visita", pending: await pendingCount(), confirmation: "" });
        continue;
      }
      try {
        const serverVisit = await send(next);
        await removeOutbox(next.id);
        await remember(next.clientVisitId, serverVisit);
        saved += 1;
        emit({ online: true, lastError: "", pending: await pendingCount() });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo sincronizar";
        const attempts = next.attempts + 1;
        await saveOutbox({ ...next, attempts, lastError: message, nextAttemptAt: Date.now() + backoff(attempts) });
        emit({
          online: !isNetworkError(error),
          lastError: message,
          pending: await pendingCount(),
          confirmation: "",
        });
        if (isNetworkError(error)) break;
      }
    }
    const pending = await pendingCount();
    emit({
      online: true,
      syncing: false,
      pending,
      confirmation:
        saved > 0 && pending === 0
          ? `Sincronización confirmada. El servidor recibió ${saved} ${saved === 1 ? "registro" : "registros"}.`
          : saved > 0
            ? `El servidor confirmó ${saved} ${saved === 1 ? "registro" : "registros"}. Quedan ${pending} pendientes.`
            : status.confirmation,
    });
  } finally {
    running = false;
    emit({ syncing: false, pending: await pendingCount() });
  }
}

export async function noteOffline() {
  emit({ online: false, pending: await pendingCount(), syncing: false, confirmation: "" });
}

export async function noteOnline() {
  emit({ online: true });
  await syncNow();
}

export async function mergedVisit(clientId: string, serverVisit: Visit) {
  return remember(clientId, serverVisit);
}
