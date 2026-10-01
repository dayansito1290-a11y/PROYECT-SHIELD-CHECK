import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatWhen } from "../api";
import { useAuth } from "../auth";
import { Badge, Card, Empty, statusLabel, statusTone } from "../components/ui";
import type { Visit } from "../types";

export function SupervisorHome() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.visits().then(setVisits).catch((err: Error) => setError(err.message));
  }, []);

  const active = visits.find((visit) => visit.status === "en_curso");
  const recent = visits.filter((visit) => visit.status === "completada").slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Buen día</p>
        <h2 className="text-2xl font-semibold">{user?.name}</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Registra la visita, confirma que estás en el centro de costo y deja evidencia de las actividades.
        </p>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand">{active ? "Visita en curso" : "Sin visita abierta"}</p>
            <h3 className="mt-1 text-xl font-semibold">{active ? active.cost_center.name : "Inicia una supervisión"}</h3>
            <p className="mt-1 text-sm text-muted">
              {active ? `${active.cost_center.address}, ${active.cost_center.city}` : "Elige el centro y valida la ubicación."}
            </p>
          </div>
          <Link
            to={active ? `/visita/${active.id}` : "/visita"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            {active ? "Continuar" : "Nueva visita"}
            <ArrowRight size={16} />
          </Link>
        </div>
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Últimas visitas</h3>
        {recent.length === 0 ? (
          <Empty title="Todavía no hay visitas cerradas" text="Cuando completes una supervisión aparecerá aquí." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recent.map((visit) => (
              <Link key={visit.id} to={`/visitas/${visit.id}`}>
                <Card className="p-4 transition hover:border-brand">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{visit.cost_center.name}</p>
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                        <MapPin size={14} />
                        {visit.cost_center.client}
                      </p>
                    </div>
                    <Badge tone={visit.location_valid ? "ok" : "bad"}>
                      {visit.location_valid ? "En sitio" : "Fuera de radio"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted">{formatWhen(visit.started_at)}</span>
                    <Badge tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
