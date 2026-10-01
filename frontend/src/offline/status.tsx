import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth";
import { ensureReferenceData } from "./field";
import { getSyncStatus, noteOffline, noteOnline, refreshPending, subscribeSync, syncNow, type SyncStatus } from "./sync";

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  useEffect(() => {
    void refreshPending();
    const onOffline = () => void noteOffline();
    const onOnline = () => void noteOnline();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void syncNow(), 15000);
    void syncNow();
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    void ensureReferenceData();
  }, [user]);

  return children;
}

export function useOffline() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  useEffect(() => {
    return subscribeSync(setStatus);
  }, []);
  return status;
}
