import { CalendarCheck, Camera, CircleCheck, ClipboardList, MapPin, TriangleAlert, Users, Building2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatWhen } from "../api";
import { useAuth } from "../auth";
import { Bars, Donut, SplitBar } from "../components/charts";
import { Logo } from "../components/Logo";
import { Badge, Card, KpiCard, LoadingState, statusLabel, statusTone } from "../components/ui";
import { loadAssignments, loadVisits, unsyncedVisits } from "../offline/field";
import type { LocalVisit } from "../offline/db";
import { useOffline } from "../offline/status";
import type { Assignment, Dashboard, NovedadAlert, Report, Visit } from "../types";

function localISO(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localISO(date);
}

function hello(name: string) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  return `${greet}, ${name.split(" ")[0]}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return <LoadingState label="Cargando el resumen de operaciones…" />;
  if (user.role === "supervisor") return <FieldDashboard />;
  return <ControlDashboard />;
}

function ControlDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [week, setWeek] = useState<Report | null>(null);
  const [todayReport, setTodayReport] = useState<Report | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [alerts, setAlerts] = useState<NovedadAlert[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const today = localISO();
    api.dashboard().then(setData).catch((err: Error) => setError(err.message));
    api.reports(shiftDays(-6), today).then(setWeek).catch(() => setWeek(null));
    api.reports(today, today).then(setTodayReport).catch(() => setTodayReport(null));
    loadAssignments().then(setAssignments).catch(() => setAssignments([]));
    api.novedadAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, [user]);

  const today = localISO();
  const scheduledToday = assignments.filter((item) => item.scheduled_for.slice(0, 10) === today && item.status !== "cancelada");
  const pending = assignments.filter((item) => item.status === "pendiente" || item.status === "en_curso");
  const completedToday = todayReport?.rows.filter((row) => row.status === "completada").length ?? 0;
  const reviewed = (todayReport?.checks_cumple ?? 0) + (todayReport?.checks_incumple ?? 0);
  const compliance = reviewed ? Math.round((todayReport?.compliance_rate ?? 0) * 100) : null;

  const byDay = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => shiftDays(index - 6));
    return days.map((day) => ({
      label: day.slice(8),
      value: week?.rows.filter((row) => row.started_at.slice(0, 10) === day).length ?? 0,
    }));
  }, [week]);

  const byPriority = useMemo(() => {
    const counts = { alta: 0, media: 0, baja: 0 };
    for (const item of week?.novedades ?? []) {
      if (item.severity in counts) counts[item.severity as keyof typeof counts] += 1;
    }
    return [
      { label: "Alta", value: counts.alta },
      { label: "Media", value: counts.media },
      { label: "Baja", value: counts.baja },
    ];
  }, [week]);

  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (!data || !user) return <LoadingState label="Cargando el resumen de operaciones…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan">Centro de control</p>
          <h2 className="text-2xl font-extrabold tracking-tight text-brand-dark">{hello(user.name)}</h2>
          <p className="mt-1 text-sm text-muted">Cumplimiento, visitas, novedades y equipo de la operación de hoy.</p>
        </div>
        <Logo className="hidden h-16 w-auto sm:block" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/reportes"><KpiCard label="Cumplimiento" value={compliance == null ? "—" : `${compliance}%`} hint={reviewed ? "Actividades evaluadas hoy" : "Sin actividades evaluadas hoy"} icon={<ClipboardList size={18} />} /></Link>
        <Link to="/visitas"><KpiCard label="Visitas programadas" value={String(scheduledToday.length)} hint={`${completedToday} completadas hoy`} icon={<CalendarCheck size={18} />} /></Link>
        <Link to="/visitas"><KpiCard label="Visitas pendientes" value={String(pending.length)} hint="Asignadas y aún no cerradas" icon={<CircleCheck size={18} />} /></Link>
        <Link to="/novedades"><KpiCard label="Novedades abiertas" value={String(data.open_novedades)} hint="Pendientes o en revisión" icon={<TriangleAlert size={18} />} /></Link>
        <Link to="/supervisores"><KpiCard label="Supervisores" value={String(data.supervisors)} hint="Registrados en la operación" icon={<Users size={18} />} /></Link>
        <Link to="/centros"><KpiCard label="Centros de costo" value={String(data.cost_centers)} hint="Sitios de servicio" icon={<Building2 size={18} />} /></Link>
        <Link to="/reportes"><KpiCard label="Actividades incumplidas" value={String(todayReport?.checks_incumple ?? 0)} hint="Evaluadas hoy" icon={<ClipboardList size={18} />} /></Link>
        <Link to="/novedades?prioridad=alta"><KpiCard label="Alertas importantes" value={String(alerts.length)} hint="Prioridad alta sin resolver" icon={<TriangleAlert size={18} />} /></Link>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3 font-semibold">Visitas programadas</div>
        {pending.length === 0 && <p className="px-4 py-6 text-sm text-muted">No hay asignaciones pendientes.</p>}
        <div className="divide-y divide-line">
          {pending.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="block font-medium">{item.cost_center.name}</span>
                <span className="text-sm text-muted">{item.supervisor.name} · {formatWhen(item.scheduled_for)}</span>
              </span>
              <Badge tone={item.status === "en_curso" ? "warn" : "brand"}>{item.status === "en_curso" ? "En curso" : "Programada"}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="font-semibold text-brand-dark">Cumplimiento de supervisiones</p>
          <p className="mb-4 text-xs text-muted">Últimos 7 días, según el reporte del servidor.</p>
          <Donut value={week && week.checks_cumple + week.checks_incumple > 0 ? Math.round(week.compliance_rate * 100) : null} label={week ? `${week.checks_cumple} cumplen y ${week.checks_incumple} incumplen.` : "Sin reporte."} />
        </Card>
        <Card className="p-4">
          <p className="font-semibold text-brand-dark">Visitas por día</p>
          <p className="mb-4 text-xs text-muted">Conteo real de visitas iniciadas cada día.</p>
          <Bars items={byDay} />
        </Card>
        <Card className="p-4">
          <p className="font-semibold text-brand-dark">Actividades cumplidas vs incumplidas</p>
          <p className="mb-4 text-xs text-muted">Últimos 7 días.</p>
          <SplitBar ok={week?.checks_cumple ?? 0} bad={week?.checks_incumple ?? 0} okLabel="cumplidas" badLabel="incumplidas" />
        </Card>
        <Card className="p-4">
          <p className="font-semibold text-brand-dark">Novedades por prioridad</p>
          <p className="mb-4 text-xs text-muted">Novedades asociadas al periodo.</p>
          <Bars items={byPriority} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 font-semibold">Supervisores · últimos 7 días</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-sand text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Supervisor</th>
                  <th className="px-4 py-3 font-medium">Visitas</th>
                  <th className="px-4 py-3 font-medium">Sin resolver</th>
                  <th className="px-4 py-3 font-medium">Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {(week?.by_supervisor ?? []).map((person) => (
                  <tr key={person.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/visitas?supervisor=${person.id}`} className="text-brand">{person.name}</Link>
                    </td>
                    <td className="px-4 py-3">{person.visits}</td>
                    <td className="px-4 py-3">{person.open_novedades}</td>
                    <td className="px-4 py-3">{person.checks ? `${Math.round((person.compliance_rate ?? 0) * 100)}%` : "—"}</td>
                  </tr>
                ))}
                {(week?.by_supervisor.length ?? 0) === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-muted">Sin visitas de supervisores en el periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Alertas</p>
            <Link to="/novedades?prioridad=alta" className="text-sm font-semibold text-brand">Revisar</Link>
          </div>
          {alerts.length === 0 && <p className="px-4 py-6 text-sm text-muted">No hay novedades de prioridad alta sin resolver.</p>}
          {alerts.slice(0, 6).map((alert) => (
            <Link key={alert.id} to="/novedades?prioridad=alta" className="block border-t border-line px-4 py-3 hover:bg-sand">
              <span className="block font-medium">{alert.title}</span>
              <span className="text-sm text-muted">{alert.cost_center} · {alert.supervisor}</span>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Visitas recientes</p>
            <Link to="/visitas" className="text-sm font-semibold text-brand">Ver todas</Link>
          </div>
          {data.recent_visits.length === 0 && <p className="px-4 py-6 text-sm text-muted">Aún no hay visitas registradas.</p>}
          <div className="divide-y divide-line">
            {data.recent_visits.slice(0, 6).map((visit) => (
              <Link key={visit.id} to={`/visitas/${visit.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sand">
                <span>
                  <span className="block font-medium">{visit.cost_center.name}</span>
                  <span className="text-sm text-muted">{visit.supervisor.name} · {formatWhen(visit.started_at)}</span>
                </span>
                <Badge tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Badge>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Novedades</p>
            <Link to="/novedades" className="text-sm font-semibold text-brand">Ver todas</Link>
          </div>
          {data.novedades.length === 0 && <p className="px-4 py-6 text-sm text-muted">No hay novedades en este corte.</p>}
          {data.novedades.map((item) => (
            <Link key={item.id} to="/novedades" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 hover:bg-sand">
              <span>
                <span className="block font-medium">{item.title}</span>
                <span className="text-sm text-muted">{item.cost_center.name}</span>
              </span>
              <Badge tone={statusTone(item.severity)}>{statusLabel(item.severity)}</Badge>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}

function FieldDashboard() {
  const { user } = useAuth();
  const net = useOffline();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [locals, setLocals] = useState<LocalVisit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadAssignments(), loadVisits(), unsyncedVisits()])
      .then(([assignmentRows, visitRows, localRows]) => {
        setAssignments(assignmentRows);
        setVisits(visitRows);
        setLocals(localRows);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [net.pending, net.online]);

  if (!user) return null;
  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (loading) return <LoadingState label="Cargando tu jornada…" />;

  const today = localISO();
  const mine = visits.filter((visit) => visit.supervisor.id === user.id);
  const todayVisits = mine.filter((visit) => visit.started_at.slice(0, 10) === today);
  const openAssignments = assignments
    .filter((item) => item.status === "pendiente" || item.status === "en_curso")
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const next = openAssignments.find((item) => item.status === "pendiente");
  const current = locals.find((row) => row.visit.status === "en_curso") ?? null;
  const serverCurrent = mine.find((visit) => visit.status === "en_curso");
  const checks = todayVisits.flatMap((visit) => visit.checks);
  const pendingChecks = checks.filter((check) => check.result === "pendiente").length;
  const doneChecks = checks.filter((check) => check.result !== "pendiente").length;
  const novedades = todayVisits.reduce((sum, visit) => sum + visit.novedades.length, 0);
  const photos = todayVisits.reduce((sum, visit) => sum + visit.photos.length, 0);
  const continueTo = current
    ? `/visita/local/${current.clientId}`
    : serverCurrent
      ? `/visita/${serverCurrent.id}`
      : next
        ? `/visita?asignacion=${next.id}`
        : "/visitas";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-cyan">En campo</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-brand-dark">{hello(user.name)}</h2>
        <p className="mt-1 text-sm text-muted">Selecciona la visita, registra la llegada, completa actividades y sincroniza.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        <Link to="/visitas" className="rounded-2xl bg-white px-2 py-3 shadow-sm">Visitas hoy<br /><span className="text-lg text-brand-dark">{todayVisits.length}</span></Link>
        <Link to={continueTo} className="rounded-2xl bg-white px-2 py-3 shadow-sm">Actividades<br /><span className="text-lg text-brand-dark">{doneChecks}/{checks.length || 0}</span></Link>
        <Link to="/configuracion" className="rounded-2xl bg-white px-2 py-3 shadow-sm">Por enviar<br /><span className="text-lg text-brand-dark">{net.pending}</span></Link>
      </div>

      <Card className="space-y-3 bg-gradient-to-br from-brand to-cyan p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">{serverCurrent || current ? "Visita actual" : next ? "Próxima visita" : "Jornada de hoy"}</p>
        <p className="text-xl font-extrabold">
          {current?.visit.cost_center.name ?? serverCurrent?.cost_center.name ?? next?.cost_center.name ?? "Sin visitas pendientes"}
        </p>
        <p className="text-sm text-white/85">
          {next ? formatWhen(next.scheduled_for) : serverCurrent ? formatWhen(serverCurrent.started_at) : "Cuando coordinación asigne un centro, aparecerá aquí."}
        </p>
        {(next || serverCurrent || current) && (
          <Link to={continueTo} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-bold text-brand">
            {serverCurrent || current ? "Continuar visita" : "Hacer check-in"}
          </Link>
        )}
      </Card>

      <ol className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {[
          ["1. Elegir visita", "/visitas"],
          ["2. Check-in", continueTo],
          ["3. Actividades", continueTo],
          ["4. Novedades", "/novedades"],
          ["5. Evidencias", continueTo],
          ["6. Sincronizar", "/configuracion"],
        ].map(([label, to]) => (
          <li key={label}>
            <Link to={to} className="flex min-h-12 items-center rounded-2xl border border-line bg-white px-3 font-semibold text-brand-dark">
              {label}
            </Link>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-dark"><ClipboardList size={16} /> Actividades de hoy</p>
          <p className="mt-2 text-sm text-muted">{pendingChecks} pendientes · {doneChecks} registradas</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-dark"><TriangleAlert size={16} /> Novedades</p>
          <p className="mt-2 text-sm text-muted">{novedades} en las visitas de hoy</p>
          <Link to="/novedades" className="mt-2 inline-flex text-sm font-semibold text-brand">Ver novedades</Link>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-dark"><Camera size={16} /> Evidencias</p>
          <p className="mt-2 text-sm text-muted">{photos} fotos en las visitas de hoy</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-dark"><RefreshCw size={16} /> Sincronización</p>
          <p className="mt-2 text-sm text-muted">
            {net.online ? "En línea" : "Sin conexión"} · {net.pending === 0 ? "Todo sincronizado" : `${net.pending} registros por enviar`}
          </p>
          <Link to="/configuracion" className="mt-2 inline-flex text-sm font-semibold text-brand">Abrir sincronización</Link>
        </Card>
      </div>

      <div className="space-y-3">
        <p className="font-semibold text-brand-dark">Visitas del día</p>
        {openAssignments.length === 0 && todayVisits.length === 0 && (
          <Card className="p-4 text-sm text-muted">No hay visitas asignadas ni iniciadas hoy.</Card>
        )}
        {openAssignments.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{item.cost_center.name}</p>
                <p className="text-sm text-muted">{item.cost_center.address}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {formatWhen(item.scheduled_for)}</p>
              </div>
              <Badge tone={item.status === "en_curso" ? "warn" : "brand"}>{item.status === "en_curso" ? "En curso" : "Programada"}</Badge>
            </div>
            <Link
              to={item.visit_id ? `/visita/${item.visit_id}` : `/visita?asignacion=${item.id}`}
              className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-brand text-sm font-bold text-white"
            >
              {item.visit_id ? "Continuar" : "Check-in"}
            </Link>
          </Card>
        ))}
        {todayVisits.filter((visit) => visit.status === "completada").map((visit) => (
          <Link key={visit.id} to={`/visitas/${visit.id}`} className="block">
            <Card className="flex items-center justify-between gap-3 p-4">
              <span>
                <span className="block font-semibold">{visit.cost_center.name}</span>
                <span className="text-sm text-muted">Check-out {formatWhen(visit.ended_at)}</span>
              </span>
              <Badge tone="ok">Completada</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
