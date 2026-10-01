import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { distanceLabel, formatWhen } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, ErrorNote, PageIntro, inputClass, statusLabel, statusTone } from "../components/ui";
import type { LocalVisit } from "../offline/db";
import { loadAssignments, loadSupervisors, loadVisits, serversWaitingSync, unsyncedVisits } from "../offline/field";
import { useOffline } from "../offline/status";
import type { Assignment, Supervisor, Visit } from "../types";

export function VisitListPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [people, setPeople] = useState<Supervisor[]>([]);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("todas");
  const [center, setCenter] = useState("");
  const [day, setDay] = useState("");
  const [locals, setLocals] = useState<LocalVisit[]>([]);
  const [waitingServers, setWaitingServers] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const net = useOffline();
  const supervisor = params.get("supervisor") ?? "";

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  useEffect(() => {
    Promise.all([loadVisits(), loadSupervisors(), loadAssignments(), unsyncedVisits(), serversWaitingSync()])
      .then(([visitRows, peopleRows, assignmentRows, localRows, waiting]) => {
        setVisits(visitRows);
        setPeople(peopleRows);
        setAssignments(assignmentRows);
        setLocals(localRows);
        setWaitingServers(waiting);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [net.pending, net.online]);

  const localActive = locals.find((row) => row.visit.status === "en_curso");
  const active = visits.find((visit) => visit.status === "en_curso");
  const visible = useMemo(() => {
    return visits.filter((visit) => {
      if (user?.role === "supervisor" && visit.supervisor.id !== user.id) return false;
      if (supervisor && String(visit.supervisor.id) !== supervisor) return false;
      if (status !== "todas" && visit.status !== status) return false;
      const text = query.trim().toLowerCase();
      if (center && String(visit.cost_center.id) !== center) return false;
      if (day && !visit.started_at.startsWith(day)) return false;
      if (!text) return true;
      return `${visit.cost_center.name} ${visit.supervisor.name}`.toLowerCase().includes(text);
    });
  }, [visits, query, status, supervisor, center, day, user]);

  const pending = assignments.filter((item) => item.status === "pendiente" || item.status === "en_curso");

  const supervisorName = people.find((person) => String(person.id) === supervisor)?.name;

  return (
    <div className="space-y-4">
      <PageIntro
        title={user?.role === "supervisor" ? "Mis visitas" : "Supervisiones"}
        text={user?.role === "supervisor" ? "Elige la visita, haz check-in y ciérrala cuando termines." : "Registro de supervisiones en campo, con validación de ubicación."}
        action={
          user?.role === "supervisor" ? (
            <Link
              to={localActive ? `/visita/local/${localActive.clientId}` : active ? `/visita/${active.id}` : "/visita"}
              className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
            >
              {localActive || active ? "Continuar visita" : "Registrar llegada"}
            </Link>
          ) : undefined
        }
      />
      {loading && <p className="text-sm text-muted">Cargando visitas…</p>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {user?.role === "supervisor" && !loading && (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 font-semibold">Pendientes</div>
          {pending.length === 0 && locals.length === 0 && <p className="px-4 py-6 text-sm text-muted">No tienes visitas pendientes.</p>}
          {locals.map((row) => (
            <div key={row.clientId} className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{row.visit.cost_center.name}</p>
                <p className="text-sm text-muted">Guardada en este dispositivo · {formatWhen(row.visit.started_at)}</p>
              </div>
              <div className="flex items-center gap-3">
                  <Badge tone="warn">Programada · sin sincronizar</Badge>
                <Link to={`/visita/local/${row.clientId}`} className="text-sm font-semibold text-brand">Continuar</Link>
              </div>
            </div>
          ))}
          <div className="divide-y divide-line">
            {pending.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{item.cost_center.name}</p>
                  <p className="text-sm text-muted">{formatWhen(item.scheduled_for)} · {item.cost_center.address}</p>
                </div>
                <Link
                  to={item.visit_id ? `/visita/${item.visit_id}` : `/visita?asignacion=${item.id}`}
                  className="text-sm font-semibold text-brand"
                >
                  {item.visit_id ? "Abrir visita" : "Registrar llegada"}
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className={`grid gap-3 ${user?.role === "supervisor" ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-5"}`}>
        <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar centro o supervisor" />
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="todas">Todos los estados</option>
          <option value="en_curso">En curso</option>
          <option value="completada">Completada</option>
        </select>
        <select className={inputClass} value={center} onChange={(event) => setCenter(event.target.value)}>
          <option value="">Todos los centros</option>
          {[...new Map(visits.map((visit) => [visit.cost_center.id, visit.cost_center.name])).entries()].map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <input className={inputClass} type="date" value={day} onChange={(event) => setDay(event.target.value)} aria-label="Fecha" />
        {user?.role !== "supervisor" && <select
          className={inputClass}
          value={supervisor}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set("supervisor", event.target.value);
            else next.delete("supervisor");
            setParams(next);
          }}
        >
          <option value="">Todos los supervisores</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>}
      </div>

      {supervisorName && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <span>Filtrado por {supervisorName}</span>
          <Button variant="ghost" onClick={() => setParams({})}>Quitar filtro</Button>
        </div>
      )}

      <div className={`grid gap-3 ${user?.role === "supervisor" ? "" : "md:hidden"}`}>
        {visible.map((visit) => (
          <Card key={visit.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{visit.cost_center.name}</p>
                <p className="text-sm text-muted">{visit.supervisor.name} · {formatWhen(visit.started_at)}</p>
              </div>
              <Badge tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Badge>
            </div>
            <Link
              to={visit.status === "en_curso" && user?.role === "supervisor" ? `/visita/${visit.id}` : `/visitas/${visit.id}`}
              className={`mt-3 inline-flex items-center justify-center rounded-2xl text-sm font-bold ${user?.role === "supervisor" ? "min-h-12 bg-brand px-4 text-white" : "min-h-11 font-semibold text-brand"}`}
            >
              {visit.status === "en_curso" && user?.role === "supervisor" ? "Continuar" : "Abrir"}
            </Link>
          </Card>
        ))}
      </div>

      <Card className={`overflow-hidden ${user?.role === "supervisor" ? "hidden" : "hidden md:block"}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sand text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Centro</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Inicio</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((visit) => (
                <tr key={visit.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{visit.cost_center.name}</td>
                  <td className="px-4 py-3">{visit.supervisor.name}</td>
                  <td className="px-4 py-3 text-muted">{formatWhen(visit.started_at)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={visit.location_valid ? "ok" : "bad"}>
                      {visit.location_valid ? "En sitio" : "Fuera"} · {distanceLabel(visit.distance_m)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Badge>
                    {waitingServers.has(visit.id) && <Badge tone="warn">Sin sincronizar</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={visit.status === "en_curso" && user?.role === "supervisor" ? `/visita/${visit.id}` : `/visitas/${visit.id}`}
                      className="font-semibold text-brand"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">No hay visitas con esos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
