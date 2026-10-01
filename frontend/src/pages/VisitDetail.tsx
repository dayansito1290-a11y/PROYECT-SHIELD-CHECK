import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, distanceLabel, formatWhen } from "../api";
import { Badge, Card, statusLabel, statusTone } from "../components/ui";
import type { Visit } from "../types";

export function VisitDetailPage() {
  const { id } = useParams();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.visit(Number(id)).then(setVisit).catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (!visit) return <p className="text-sm text-muted">Cargando visita…</p>;

  return (
    <div className="space-y-4">
      <Link to="/visitas" className="text-sm font-semibold text-brand">Volver</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-dark">{visit.cost_center.name}</h2>
          <p className="text-sm text-muted">
            {visit.supervisor.name} · {formatWhen(visit.started_at)}
            {visit.ended_at ? ` – ${formatWhen(visit.ended_at)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Badge>
          <Badge tone={visit.location_valid ? "ok" : "bad"}>
            {visit.location_valid ? "En sitio" : "Fuera de radio"} · {distanceLabel(visit.distance_m)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="font-semibold text-brand-dark">Información general</p>
          <p className="mt-2 text-sm"><span className="text-muted">Supervisor. </span>{visit.supervisor.name}</p>
          <p className="text-sm"><span className="text-muted">Centro. </span>{visit.cost_center.name}</p>
          <p className="text-sm"><span className="text-muted">Llegada. </span>{formatWhen(visit.started_at)}</p>
          <p className="text-sm"><span className="text-muted">Salida. </span>{formatWhen(visit.ended_at)}</p>
          <p className="mt-2 text-sm">{visit.cost_center.client}</p>
          <p className="text-sm text-muted">{visit.cost_center.address}, {visit.cost_center.city}</p>
          {visit.location_note && <p className="mt-2 text-sm">{visit.location_note}</p>}
          {visit.summary && <p className="mt-3 text-sm">Cierre: {visit.summary}</p>}
          {visit.check_lat != null && visit.check_lng != null && (
            <a className="mt-3 inline-flex font-semibold text-brand" href={`https://www.google.com/maps?q=${visit.check_lat},${visit.check_lng}`} target="_blank" rel="noreferrer">
              Ver ubicación del check-in
            </a>
          )}
        </Card>
        <Card className="p-4">
          <p className="font-semibold">Actividades</p>
          <ul className="mt-3 space-y-2">
            {visit.checks.map((check) => (
              <li key={check.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{check.name}</span>
                <Badge tone={statusTone(check.result)}>{statusLabel(check.result)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-4">
        <p className="font-semibold">Evidencia</p>
        {visit.photos.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Esta visita no tiene fotografías.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {visit.photos.map((photo) => (
              <figure key={photo.id} className="overflow-hidden rounded-xl border border-line">
                <img src={photo.url} alt={photo.caption || "Evidencia"} className="h-36 w-full object-cover" />
                {photo.caption && <figcaption className="px-2 py-1 text-xs text-muted">{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="font-semibold">Novedades</p>
        {visit.novedades.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Sin novedades reportadas.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {visit.novedades.map((item) => (
              <li key={item.id} className="rounded-xl bg-sand px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  <Badge tone={statusTone(item.severity)}>{statusLabel(item.severity)}</Badge>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{item.description}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
