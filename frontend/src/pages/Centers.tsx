import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, formatWhen } from "../api";
import { loadAssignments } from "../offline/field";
import { useAuth } from "../auth";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageIntro, inputClass, statusLabel, statusTone } from "../components/ui";
import type { Assignment, CostCenter, Report } from "../types";

const emptyForm = {
  name: "",
  client: "",
  address: "",
  city: "Bogotá",
  lat: "4.65",
  lng: "-74.08",
  radius_m: "200",
};

function CenterCatalog() {
  const { user } = useAuth();
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CostCenter | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.centers().then(setCenters).catch((err: Error) => setError(err.message));
    api.assignments().then(setAssignments).catch(() => setAssignments([]));
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    api.reports(iso(start), iso(end)).then(setReport).catch(() => setReport(null));
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return centers;
    return centers.filter((center) => `${center.name} ${center.client} ${center.address}`.toLowerCase().includes(text));
  }, [centers, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createCenter({
        name: form.name,
        client: form.client,
        address: form.address,
        city: form.city,
        lat: Number(form.lat),
        lng: Number(form.lng),
        radius_m: Number(form.radius_m),
      });
      setCenters((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setForm(emptyForm);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el centro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Centros de costo"
        text="Sitios donde se presta el servicio y radio usado para validar la visita."
        action={
          user?.role === "coordinador" ? (
            <Button onClick={() => { setError(""); setOpen(true); }}>Nuevo centro</Button>
          ) : undefined
        }
      />
      <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar centro, cliente o dirección" />
      {error && !open && <ErrorNote>{error}</ErrorNote>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sand text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Centro</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Dirección</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Última visita</th>
                <th className="px-4 py-3 font-medium">Cumplimiento</th>
                <th className="px-4 py-3 font-medium">Radio</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((center) => (
                <tr key={center.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{center.name}</td>
                  <td className="px-4 py-3">{center.client}</td>
                  <td className="px-4 py-3">{center.address}, {center.city}</td>
                  <td className="px-4 py-3">{assignments.filter((item) => item.cost_center.id === center.id).sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))[0]?.supervisor.name ?? "Sin asignación"}</td>
                  <td className="px-4 py-3 text-muted">{formatWhen(report?.rows.filter((row) => row.center === center.name).sort((a, b) => b.started_at.localeCompare(a.started_at))[0]?.started_at ?? null)}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const rows = report?.rows.filter((row) => row.center === center.name) ?? [];
                      const ok = rows.reduce((sum, row) => sum + row.cumple, 0);
                      const bad = rows.reduce((sum, row) => sum + row.incumple, 0);
                      return ok + bad ? `${Math.round((ok / (ok + bad)) * 100)}%` : "—";
                    })()}
                  </td>
                  <td className="px-4 py-3">{center.radius_m} m</td>
                  <td className="px-4 py-3 text-right">
                    <button className="font-semibold text-brand" onClick={() => setSelected(center)}>Ver ficha</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={selected !== null} title={selected?.name ?? "Centro"} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-3 text-sm">
            <p><span className="text-muted">Cliente. </span>{selected.client}</p>
            <p><span className="text-muted">Dirección. </span>{selected.address}, {selected.city}</p>
            <p><span className="text-muted">Coordenadas. </span>{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</p>
            <p><span className="text-muted">Radio de validación. </span>{selected.radius_m} metros</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSelected(null)}>Cerrar</Button>
              <a
                className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
                href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir mapa
              </a>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} title="Nuevo centro de costo" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Cliente">
            <input className={inputClass} value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} required />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Dirección">
              <input className={inputClass} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
            </Field>
          </div>
          <Field label="Ciudad">
            <input className={inputClass} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} required />
          </Field>
          <Field label="Radio (m)">
            <input className={inputClass} type="number" min={30} max={2000} value={form.radius_m} onChange={(event) => setForm({ ...form, radius_m: event.target.value })} required />
          </Field>
          <Field label="Latitud">
            <input className={inputClass} type="number" step="0.0001" value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} required />
          </Field>
          <Field label="Longitud">
            <input className={inputClass} type="number" step="0.0001" value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} required />
          </Field>
          {error && <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy}>{busy ? "Guardando…" : "Crear centro"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AssignedCenters() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssignments()
      .then(setRows)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const centers = new Map<number, Assignment>();
  for (const row of rows) {
    const current = centers.get(row.cost_center.id);
    if (!current || row.scheduled_for > current.scheduled_for) centers.set(row.cost_center.id, row);
  }

  return (
    <div className="space-y-4">
      <PageIntro title="Centros de costo" text="Centros que coordinación te asignó para supervisar." />
      {loading && <p className="text-sm text-muted">Cargando centros asignados…</p>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!loading && centers.size === 0 && <Card className="p-5 text-sm text-muted">Todavía no tienes centros asignados.</Card>}
      <div className="grid gap-3 md:grid-cols-2">
        {[...centers.values()].map((item) => (
          <Card key={item.cost_center.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.cost_center.name}</p>
                <p className="text-sm text-muted">{item.cost_center.client}</p>
              </div>
              <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
            </div>
            <p className="mt-2 text-sm">{item.cost_center.address}, {item.cost_center.city}</p>
            <p className="mt-1 text-sm text-muted">
              {item.status === "pendiente" ? "Próxima visita" : item.status === "en_curso" ? "Visita en curso" : "Última visita"} {formatWhen(item.scheduled_for)}
            </p>
            {item.status === "pendiente" && (
              <Link to={`/visita?asignacion=${item.id}`} className="mt-3 inline-flex text-sm font-semibold text-brand">
                Registrar llegada
              </Link>
            )}
            {item.visit_id && item.status === "en_curso" && (
              <Link to={`/visita/${item.visit_id}`} className="mt-3 inline-flex text-sm font-semibold text-brand">
                Continuar visita
              </Link>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CentersPage() {
  const { user } = useAuth();
  if (user?.role === "supervisor") return <AssignedCenters />;
  return <CenterCatalog />;
}
