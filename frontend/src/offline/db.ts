import type { Visit } from "../types";

const DB_NAME = "sic-campo";
const DB_VERSION = 1;

export type OutboxKind = "start" | "check" | "novedad" | "photo" | "close";

export type OutboxOp = {
  id: string;
  kind: OutboxKind;
  clientVisitId: string;
  serverVisitId: number | null;
  recordedAt: string;
  attempts: number;
  lastError: string;
  nextAttemptAt: number;
  payload: Record<string, unknown>;
  blob?: Blob;
};

export type LocalVisit = {
  clientId: string;
  serverId: number | null;
  updatedAt: string;
  visit: Visit;
};

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("visits")) {
        const visits = db.createObjectStore("visits", { keyPath: "clientId" });
        visits.createIndex("byServer", "serverId");
      }
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(storeName: "outbox" | "visits" | "cache", mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = action(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function cacheSet(key: string, value: unknown) {
  return run("cache", "readwrite", (store) => store.put({ key, value }));
}

export async function cacheGet<T>(key: string) {
  const row = await run<{ key: string; value: T } | undefined>("cache", "readonly", (store) => store.get(key));
  return row?.value ?? null;
}

export function saveLocalVisit(entry: LocalVisit) {
  return run("visits", "readwrite", (store) => store.put(entry));
}

export function readLocalVisit(clientId: string) {
  return run<LocalVisit | undefined>("visits", "readonly", (store) => store.get(clientId));
}

export function listLocalVisits() {
  return run<LocalVisit[]>("visits", "readonly", (store) => store.getAll());
}

export async function localVisitByServer(serverId: number) {
  const rows = await listLocalVisits();
  return rows.find((row) => row.serverId === serverId) ?? null;
}

export function enqueue(op: OutboxOp) {
  return run("outbox", "readwrite", (store) => store.put(op));
}

export function listOutbox() {
  return run<OutboxOp[]>("outbox", "readonly", (store) => store.getAll());
}

export function readOutbox(id: string) {
  return run<OutboxOp | undefined>("outbox", "readonly", (store) => store.get(id));
}

export function saveOutbox(op: OutboxOp) {
  return run("outbox", "readwrite", (store) => store.put(op));
}

export function removeOutbox(id: string) {
  return run("outbox", "readwrite", (store) => store.delete(id));
}

export async function outboxFor(clientVisitId: string) {
  const rows = await listOutbox();
  return rows.filter((row) => row.clientVisitId === clientVisitId);
}

export async function pendingCount() {
  const rows = await listOutbox();
  return rows.length;
}
