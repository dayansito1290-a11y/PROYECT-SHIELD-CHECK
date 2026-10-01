import { Camera, Check as CheckIcon, MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { distanceLabel, formatWhen, type ActivityItem } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, ErrorNote, Field, SuccessNote, inputClass, statusLabel, statusTone } from "../components/ui";
import { beginVisit, loadActivities, loadAssignments, openLocal, openServerVisit, readPhotoBlob, saveCheck, saveClose, saveNovedad, savePhoto, visitPending } from "../offline/field";
import { useOffline } from "../offline/status";
import type { Assignment, Check, CostCenter, Photo, Visit } from "../types";

type Step = "lugar" | "actividades" | "evidencia" | "cierre";
type Fix = { lat: number; lng: number; note: string };

const steps: { id: Step; label: string }[] = [
  { id: "lugar", label: "Check-in" },
  { id: "actividades", label: "Actividades" },
  { id: "evidencia", label: "Evidencia" },
  { id: "cierre", label: "Check-out" },
];

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador no puede leer la ubicación del dispositivo"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        reject(new Error("Permiso de ubicación denegado. Actívalo en el navegador para registrar la llegada."));
        return;
      }
      reject(new Error("No se pudo obtener la ubicación del dispositivo"));
    }, { enableHighAccuracy: true, timeout: 12000 });
  });
}

export function VisitFlow() {
  const { id, clientId: routeClientId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const net = useOffline();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [localKey, setLocalKey] = useState<string | null>(routeClientId ?? null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentId, setAssignmentId] = useState<number | null>(
    params.get("asignacion") ? Number(params.get("asignacion")) : null,
  );
  const [fix, setFix] = useState<Fix | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [step, setStep] = useState<Step>(id ? "actividades" : "lugar");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [savingCheck, setSavingCheck] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [novedad, setNovedad] = useState({ title: "", description: "", severity: "media" });
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (id || routeClientId) return;
    Promise.all([loadAssignments(), loadActivities()])
      .then(([rows, activityRows]) => {
        setAssignments(rows.filter((item) => item.status === "pendiente" || item.status === "en_curso"));
        setActivities(activityRows);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, routeClientId]);

  useEffect(() => {
    if (!routeClientId) return;
    setLoading(true);
    openLocal(routeClientId)
      .then((row) => {
        if (!row) {
          setError("No se encontró la visita en este dispositivo.");
          return;
        }
        setLocalKey(row.clientId);
        setVisit(row.visit);
        setSummary(row.visit.summary);
        setNotes(Object.fromEntries(row.visit.checks.map((check) => [check.activity_id, check.notes])));
        setStep(row.visit.status === "completada" ? "cierre" : "actividades");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [routeClientId]);

  useEffect(() => {
    if (!id || routeClientId) return;
    setLoading(true);
    openServerVisit(Number(id))
      .then((data) => {
        setLocalKey(data.clientId);
        setVisit(data.visit);
        setSummary(data.visit.summary);
        setNotes(Object.fromEntries(data.visit.checks.map((check) => [check.activity_id, check.notes])));
        setStep(data.visit.status === "completada" ? "cierre" : "actividades");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, routeClientId]);

  useEffect(() => {
    if (!localKey) return;
    void openLocal(localKey).then(async (row) => {
      if (!row) return;
      setVisit(row.visit);
      setNotes((current) => {
        const next = { ...current };
        for (const check of row.visit.checks) {
          if (next[check.activity_id] == null) next[check.activity_id] = check.notes;
        }
        return next;
      });
      const left = await visitPending(localKey);
      if (routeClientId && row.serverId && left === 0) navigate(`/visita/${row.serverId}`, { replace: true });
    });
  }, [localKey, net.pending, net.confirmation, navigate, routeClientId]);

  const selected = assignments.find((item) => item.id === assignmentId) ?? null;
  const center = visit?.cost_center ?? selected?.cost_center ?? null;

  async function locate(demo: boolean) {
    if (!center) return;
    setError("");
    setNotice("");
    setLocating(true);
    try {
      if (demo) {
        setFix({ lat: center.lat, lng: center.lng, note: "Ubicación del centro usada porque el GPS no estuvo disponible" });
        return;
      }
      const position = await readPosition();
      setFix({ lat: position.coords.latitude, lng: position.coords.longitude, note: "" });
      setNotice("Permiso de ubicación concedido. Ya puedes registrar la llegada.");
    } catch (err) {
      setFix(null);
      setError(err instanceof Error ? err.message : "No se pudo validar la ubicación");
    } finally {
      setLocating(false);
    }
  }

  function applySave(saved: { visit: Visit; clientId: string; pending: boolean; stale: boolean }, pendingText: string, syncedText: string) {
    setLocalKey(saved.clientId);
    setVisit(saved.visit);
    setNotes(Object.fromEntries(saved.visit.checks.map((check) => [check.activity_id, check.notes])));
    if (saved.stale) {
      setNotice("El servidor ya tenía un cambio más reciente. Se conservó ese dato.");
      return;
    }
    setNotice(saved.pending ? pendingText : syncedText);
  }

  async function start() {
    if (!center || !fix || !user) return;
    setStarting(true);
    setError("");
    try {
      const saved = await beginVisit({
        user,
        center,
        assignment: selected,
        lat: fix.lat,
        lng: fix.lng,
        locationNote: fix.note,
        activities,
      });
      setLocalKey(saved.clientId);
      setNotice(
        saved.pending
          ? `Sin conexión. La llegada de las ${formatWhen(saved.visit.started_at)} quedó guardada en este dispositivo.`
          : `Llegada registrada el ${formatWhen(saved.visit.started_at)}.`,
      );
      navigate(saved.pending ? `/visita/local/${saved.clientId}` : `/visita/${saved.visit.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la llegada");
    } finally {
      setStarting(false);
    }
  }

  async function mark(check: Check, result: Check["result"]) {
    if (!visit || !localKey) return;
    setSavingCheck(check.activity_id);
    setError("");
    setNotice("");
    try {
      const saved = await saveCheck(localKey, visit, check.activity_id, result, notes[check.activity_id] ?? "");
      applySave(
        saved,
        result === "cumple" ? "Cumplida guardada en este dispositivo. Pendiente de sincronización." : "Incumplida guardada en este dispositivo. Pendiente de sincronización.",
        result === "cumple" ? "Actividad marcada como cumplida." : "Actividad marcada como incumplida.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la actividad");
    } finally {
      setSavingCheck(null);
    }
  }

  async function saveNotes(check: Check) {
    if (!visit || !localKey) return;
    const result = check.result === "pendiente" ? "pendiente" : check.result;
    setSavingCheck(check.activity_id);
    setError("");
    try {
      const saved = await saveCheck(localKey, visit, check.activity_id, result, notes[check.activity_id] ?? "");
      applySave(saved, "Observación guardada en este dispositivo. Pendiente de sincronización.", "Observación guardada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la observación");
    } finally {
      setSavingCheck(null);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!visit || !file || !localKey) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const saved = await savePhoto(localKey, visit, file, caption);
      setCaption("");
      applySave(saved, "Fotografía guardada en este dispositivo. Pendiente de sincronización.", "Fotografía adjuntada a la visita.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo adjuntar la fotografía");
    } finally {
      setUploading(false);
    }
  }

  async function addNovedad(event: FormEvent) {
    event.preventDefault();
    if (!visit || !localKey) return;
    setReporting(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveNovedad(localKey, visit, novedad);
      setNovedad({ title: "", description: "", severity: "media" });
      applySave(saved, "Novedad guardada en este dispositivo. Pendiente de sincronización.", "Novedad registrada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la novedad");
    } finally {
      setReporting(false);
    }
  }

  async function closeVisit() {
    if (!visit || !localKey) return;
    setClosing(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveClose(localKey, visit, summary);
      setVisit(saved.visit);
      setStep("cierre");
      setNotice(
        saved.pending
          ? `Salida de las ${formatWhen(saved.visit.ended_at)} guardada en este dispositivo. Pendiente de sincronización.`
          : `Salida registrada el ${formatWhen(saved.visit.ended_at)}. La visita quedó finalizada.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la salida");
    } finally {
      setClosing(false);
    }
  }

  const pending = visit?.checks.filter((check) => check.result === "pendiente").length ?? 0;

  if (loading) return <p className="text-sm text-muted">Cargando visita…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{center ? center.name : "Visita asignada"}</h2>
        <p className="text-sm text-muted">
          {center ? `${center.client} · ${center.address}` : "Elige una asignación pendiente para registrar la llegada."}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {steps.map((item, index) => {
          const active = item.id === step;
          const locked = !visit && item.id !== "lugar";
          return (
            <button
              key={item.id}
              disabled={locked}
              onClick={() => setStep(item.id)}
              className={`rounded-xl border px-2 py-2 text-left text-xs font-semibold sm:text-sm ${
                active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink"
              } disabled:opacity-40`}
            >
              <span className="block text-[10px] font-medium opacity-70">{index + 1}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      {net.pending > 0 && localKey && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Hay registros de esta sesión pendientes de sincronización.
        </p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote>{notice}</SuccessNote>}

      {step === "lugar" && !visit && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-3">
            {assignments.length === 0 && (
              <Card className="p-5 text-sm text-muted">No tienes visitas pendientes asignadas.</Card>
            )}
            {assignments.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setAssignmentId(item.id);
                  setFix(null);
                  setNotice("");
                  setError("");
                }}
                className={`rounded-2xl border bg-white p-4 text-left ${assignmentId === item.id ? "border-brand ring-2 ring-brand/20" : "border-line"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.cost_center.name}</p>
                    <p className="text-sm text-muted">{item.cost_center.address}</p>
                    <p className="mt-1 text-sm">Programada {formatWhen(item.scheduled_for)}</p>
                  </div>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                </div>
                {item.notes && <p className="mt-2 text-sm text-muted">{item.notes}</p>}
              </button>
            ))}
          </div>
          <Card className="h-fit p-5">
            <div className="flex items-center gap-2 font-semibold">
              <MapPin size={18} />
              Registrar llegada
            </div>
            <p className="mt-2 text-sm text-muted">
              Se solicitará permiso para usar la ubicación del dispositivo. Si no hay Internet, la llegada queda en este equipo hasta sincronizarse.
            </p>
            <div className="mt-4 grid gap-2">
              <Button disabled={!selected || locating || starting} onClick={() => locate(false)}>
                {locating ? "Consultando ubicación…" : "Permitir ubicación"}
              </Button>
              <Button variant="secondary" disabled={!selected || locating || starting} onClick={() => locate(true)}>
                Usar ubicación del centro
              </Button>
            </div>
            {fix && center && <LocationPreview center={center} fix={fix} />}
            <Button className="mt-4 w-full" disabled={!fix || starting || locating} onClick={start}>
              {starting ? "Registrando llegada…" : "Confirmar check-in"}
            </Button>
          </Card>
        </div>
      )}

      {step === "lugar" && visit && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={visit.location_valid ? "ok" : "bad"}>{visit.location_valid ? "Ubicación válida" : "Fuera del radio"}</Badge>
            <span className="text-sm text-muted">Llegada {formatWhen(visit.started_at)} · {distanceLabel(visit.distance_m)}</span>
          </div>
          <p className="mt-3 text-sm text-muted">
            Coordenadas {visit.check_lat?.toFixed(5)}, {visit.check_lng?.toFixed(5)}
          </p>
          {visit.location_note && <p className="mt-2 text-sm">{visit.location_note}</p>}
          <Button className="mt-4" onClick={() => setStep("actividades")}>Seguir con actividades</Button>
        </Card>
      )}

      {step === "actividades" && visit && (
        <div className="grid gap-3">
          {visit.checks.map((check) => (
            <Card key={check.id} className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{check.name}</p>
                    <p className="text-sm text-muted">{check.description}</p>
                  </div>
                  <Badge tone={statusTone(check.result)}>{statusLabel(check.result)}</Badge>
                </div>
                <Field label="Observación">
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={notes[check.activity_id] ?? ""}
                    disabled={visit.status !== "en_curso" || savingCheck === check.activity_id}
                    onChange={(event) => setNotes({ ...notes, [check.activity_id]: event.target.value })}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={check.result === "cumple" ? "primary" : "secondary"}
                    disabled={visit.status !== "en_curso" || savingCheck === check.activity_id}
                    onClick={() => mark(check, "cumple")}
                  >
                    <CheckIcon size={16} />
                    {savingCheck === check.activity_id ? "Guardando…" : "Cumple"}
                  </Button>
                  <Button
                    variant={check.result === "incumple" ? "primary" : "secondary"}
                    disabled={visit.status !== "en_curso" || savingCheck === check.activity_id}
                    onClick={() => mark(check, "incumple")}
                  >
                    <X size={16} />
                    Incumple
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={visit.status !== "en_curso" || savingCheck === check.activity_id}
                    onClick={() => saveNotes(check)}
                  >
                    Guardar observación
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => setStep("evidencia")}>Continuar</Button>
          </div>
        </div>
      )}

      {step === "evidencia" && visit && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Camera size={18} />
              Fotografías
            </div>
            <Field label="Descripción de la evidencia">
              <input className={`${inputClass} mt-2`} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Ej. Baño piso 2" disabled={visit.status !== "en_curso" || uploading} />
            </Field>
            <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-4 py-8 text-sm font-medium text-brand">
              {uploading ? "Adjuntando fotografía…" : "Tomar o elegir foto"}
              <input
                className="hidden"
                type="file"
                accept="image/*"
                capture="environment"
                disabled={visit.status !== "en_curso" || uploading}
                onChange={(event) => onPhoto(event.target.files?.[0])}
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {visit.photos.map((photo) => (
                <figure key={photo.client_id || photo.id} className="overflow-hidden rounded-xl border border-line">
                  <EvidenceImage photo={photo} />
                  {photo.caption && <figcaption className="px-2 py-1 text-xs text-muted">{photo.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="font-semibold">Novedad</p>
            <form onSubmit={addNovedad} className="mt-3 space-y-3">
              <Field label="Título">
                <input className={inputClass} value={novedad.title} onChange={(event) => setNovedad({ ...novedad, title: event.target.value })} required disabled={visit.status !== "en_curso" || reporting} />
              </Field>
              <Field label="Descripción">
                <textarea className={inputClass} rows={3} value={novedad.description} onChange={(event) => setNovedad({ ...novedad, description: event.target.value })} required disabled={visit.status !== "en_curso" || reporting} />
              </Field>
              <Field label="Prioridad">
                <select className={inputClass} value={novedad.severity} onChange={(event) => setNovedad({ ...novedad, severity: event.target.value })} disabled={visit.status !== "en_curso" || reporting}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </Field>
              <Button disabled={visit.status !== "en_curso" || reporting}>{reporting ? "Registrando…" : "Registrar novedad"}</Button>
            </form>
            <ul className="mt-4 space-y-2">
              {visit.novedades.map((item) => (
                <li key={item.client_id || item.id} className="rounded-xl bg-sand px-3 py-2 text-sm">
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-muted"> · Prioridad {statusLabel(item.severity)}</span>
                  <p className="mt-1 text-muted">{item.description}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setStep("cierre")}>Ir al check-out</Button>
            </div>
          </Card>
        </div>
      )}

      {step === "cierre" && visit && (
        <Card className="p-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={visit.status === "completada" ? "ok" : "warn"}>{statusLabel(visit.status)}</Badge>
            <Badge tone="neutral">Llegada {formatWhen(visit.started_at)}</Badge>
            {visit.ended_at && <Badge tone="neutral">Salida {formatWhen(visit.ended_at)}</Badge>}
            <Badge tone={pending ? "bad" : "ok"}>{pending ? `${pending} actividades pendientes` : "Actividades listas"}</Badge>
          </div>
          <p className="mt-4 text-sm text-muted">
            {visit.photos.length} {visit.photos.length === 1 ? "foto" : "fotos"} · {visit.novedades.length}{" "}
            {visit.novedades.length === 1 ? "novedad" : "novedades"} · distancia {distanceLabel(visit.distance_m)}
          </p>
          {visit.status === "en_curso" ? (
            <>
              <Field label="Observación de cierre">
                <textarea className={`${inputClass} mt-2`} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Opcional" />
              </Field>
              <Button className="mt-4" disabled={closing || pending > 0} onClick={closeVisit}>
                {closing ? "Registrando salida…" : "Registrar check-out"}
              </Button>
            </>
          ) : (
            <div className="mt-4">
              <p className="text-sm">{visit.summary || "Visita finalizada sin observación adicional."}</p>
              {visit.id ? (
                <Link to={`/visitas/${visit.id}`} className="mt-4 inline-flex text-sm font-semibold text-brand">Ver detalle</Link>
              ) : (
                <p className="mt-4 text-sm text-muted">El detalle quedará disponible cuando el servidor confirme la visita.</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function EvidenceImage({ photo }: { photo: Photo }) {
  const [src, setSrc] = useState(photo.url);
  useEffect(() => {
    if (!photo.url.startsWith("idb:") || !photo.client_id) {
      setSrc(photo.url);
      return;
    }
    let active = true;
    let revoke = "";
    void readPhotoBlob(photo.client_id).then((blob) => {
      if (!active || !blob) return;
      revoke = URL.createObjectURL(blob);
      setSrc(revoke);
    });
    return () => {
      active = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [photo.client_id, photo.url]);
  return <img src={src} alt={photo.caption || "Evidencia"} className="h-28 w-full object-cover" />;
}

function LocationPreview({ center, fix }: { center: CostCenter; fix: Fix }) {
  const distance = haversine(fix.lat, fix.lng, center.lat, center.lng);
  const valid = distance <= center.radius_m;
  return (
    <div className={`mt-4 rounded-xl px-3 py-3 text-sm ${valid ? "bg-emerald-50 text-ok" : "bg-red-50 text-bad"}`}>
      <p className="font-semibold">{valid ? "Dentro del radio del centro" : "Fuera del radio del centro"}</p>
      <p>
        {distanceLabel(distance)} respecto a {center.name}. El radio permitido es {center.radius_m} m.
      </p>
      {fix.note && <p className="mt-1">{fix.note}</p>}
    </div>
  );
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlmb = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}
