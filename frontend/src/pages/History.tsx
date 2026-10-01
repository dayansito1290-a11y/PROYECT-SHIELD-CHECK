import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, distanceLabel, formatWhen } from "../api";
import { Badge, Card, Empty, statusLabel, statusTone } from "../components/ui";
import type { Visit } from "../types";

export function HistoryPage() {
  const [visits, setVisits] = useState<Visit[]>([]);

  useEffect(() => {
    api.visits().then(setVisits);
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Historial</h2>
      {visits.length === 0 ? (
        <Empty title="Sin visitas" text="Las supervisiones que registres quedarán en esta lista." />
      ) : (
        <div className="grid gap-3">
          {visits.map((visit) => (
            <Link key={visit.id} to={visit.status === "en_curso" ? `/visita/${visit.id}` : `/visitas/${visit.id}`}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{visit.cost_center.name}</p>
                  <p className="text-sm text-muted">{formatWhen(visit.started_at)} · {distanceLabel(visit.distance_m)}</p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Badge>
                  <Badge tone={visit.location_valid ? "ok" : "bad"}>{visit.location_valid ? "En sitio" : "Fuera de radio"}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
