import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatWhen } from "../api";
import { Badge, Button, Card, ErrorNote, Field, PageIntro, inputClass, statusLabel, statusTone } from "../components/ui";
import type { Report } from "../types";

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function saveCsv(filename: string, header: string[], lines: (string | number | null)[][]) {
  const csv = [header, ...lines]
    .map((cols) => cols.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadVisits(report: Report) {
  saveCsv(
    `reporte-visitas-${report.start}-${report.end}.csv`,
    ["Fecha", "Centro", "Supervisor", "Estado", "Ubicación", "Distancia m", "Novedades", "Cumple", "Incumple"],
    report.rows.map((row) => [
      row.started_at,
      row.center,
      row.supervisor,
      statusLabel(row.status),
      row.location_valid ? "En sitio" : "Fuera de radio",
      row.distance_m ?? "",
      row.novedades,
      row.cumple,
      row.incumple,
    ]),
  );
}

function downloadNovedades(report: Report) {
  saveCsv(
    `reporte-novedades-${report.start}-${report.end}.csv`,
    ["Fecha", "Título", "Descripción", "Prioridad", "Estado", "Centro", "Supervisor"],
    report.novedades.map((row) => [
      row.created_at,
      row.title,
      row.description,
      statusLabel(row.severity),
      statusLabel(row.status),
      row.center,
      row.supervisor,
    ]),
  );
}

export function ReportsPage() {
  const [start, setStart] = useState(isoDaysAgo(6));
  const [end, setEnd] = useState(isoDaysAgo(0));
  const [report, setReport] = useState<Report | null>(null);
  const [person, setPerson] = useState("");
  const [center, setCenter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load(from = start, to = end) {
    setBusy(true);
    setError("");
    api
      .reports(from, to)
      .then(setReport)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    load(isoDaysAgo(6), isoDaysAgo(0));
  }, []);

  const shown = useMemo(() => {
    if (!report) return null;
    const rows = report.rows.filter((row) => (!person || row.supervisor === person) && (!center || row.center === center));
    const novedades = report.novedades.filter((item) => (!person || item.supervisor === person) && (!center || item.center === center));
    const checksOk = rows.reduce((sum, row) => sum + row.cumple, 0);
    const checksBad = rows.reduce((sum, row) => sum + row.incumple, 0);
    return {
      ...report,
      rows,
      novedades,
      visits: rows.length,
      checks_cumple: checksOk,
      checks_incumple: checksBad,
      compliance_rate: checksOk + checksBad ? checksOk / (checksOk + checksBad) : 0,
      open_novedades: novedades.filter((item) => item.status !== "resuelta").length,
      location_ok_rate: rows.filter((row) => row.status === "completada").length
        ? rows.filter((row) => row.status === "completada" && row.location_valid).length / rows.filter((row) => row.status === "completada").length
        : 0,
    };
  }, [report, person, center]);

  return (
    <div className="space-y-5">
      <PageIntro
        title="Reportes"
        text="Visitas, cumplimiento de actividades y novedades del periodo, con los datos guardados en el servidor."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!shown || busy} onClick={() => shown && downloadVisits(shown)}>
              Exportar visitas
            </Button>
            <Button variant="secondary" disabled={!shown || busy} onClick={() => shown && downloadNovedades(shown)}>
              Exportar novedades
            </Button>
          </div>
        }
      />

      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field label="Desde">
          <input className={inputClass} type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="Hasta">
          <input className={inputClass} type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
        <Button disabled={busy} onClick={() => load()}>{busy ? "Consultando…" : "Aplicar periodo"}</Button>
        <Field label="Supervisor">
          <select className={inputClass} value={person} onChange={(event) => setPerson(event.target.value)}>
            <option value="">Todos</option>
            {[...new Set(report?.rows.map((row) => row.supervisor) ?? [])].map((name) => <option key={name}>{name}</option>)}
          </select>
        </Field>
        <Field label="Centro de costo">
          <select className={inputClass} value={center} onChange={(event) => setCenter(event.target.value)}>
            <option value="">Todos</option>
            {[...new Set(report?.rows.map((row) => row.center) ?? [])].map((name) => <option key={name}>{name}</option>)}
          </select>
        </Field>
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}

      {shown && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-muted">Visitas del periodo</p>
              <p className="mt-2 text-3xl font-semibold">{shown.visits}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted">Cumplimiento</p>
              <p className="mt-2 text-3xl font-semibold">{Math.round(shown.compliance_rate * 100)}%</p>
              <p className="mt-1 text-xs text-muted">{shown.checks_cumple} cumplen · {shown.checks_incumple} incumplen</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted">Novedades sin resolver</p>
              <p className="mt-2 text-3xl font-semibold">{shown.open_novedades}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted">Ubicación válida</p>
              <p className="mt-2 text-3xl font-semibold">{Math.round(shown.location_ok_rate * 100)}%</p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3 font-semibold">Por supervisor</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-sand text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Supervisor</th>
                    <th className="px-4 py-3 font-medium">Visitas</th>
                    <th className="px-4 py-3 font-medium">Sin resolver</th>
                    <th className="px-4 py-3 font-medium">Cumplimiento</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {shown.by_supervisor.filter((item) => !person || item.name === person).map((item) => (
                    <tr key={item.id} className="border-t border-line">
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">{item.visits}</td>
                      <td className="px-4 py-3">{item.open_novedades}</td>
                      <td className="px-4 py-3">{item.checks ? `${Math.round((item.compliance_rate ?? 0) * 100)}%` : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/visitas?supervisor=${item.id}`} className="font-semibold text-brand">Ver visitas</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3 font-semibold">Detalle</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-sand text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Centro</th>
                    <th className="px-4 py-3 font-medium">Supervisor</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Novedades</th>
                    <th className="px-4 py-3 font-medium">Cumple</th>
                    <th className="px-4 py-3 font-medium">Incumple</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.rows.map((row) => (
                    <tr key={row.id} className="border-t border-line">
                      <td className="px-4 py-3">{formatWhen(row.started_at)}</td>
                      <td className="px-4 py-3 font-medium">
                        <Link to={`/visitas/${row.id}`} className="text-brand">{row.center}</Link>
                      </td>
                      <td className="px-4 py-3">{row.supervisor}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                      <td className="px-4 py-3">{row.novedades}</td>
                      <td className="px-4 py-3">{row.cumple}</td>
                      <td className="px-4 py-3">{row.incumple}</td>
                    </tr>
                  ))}
                  {shown.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">No hay visitas en este periodo.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
