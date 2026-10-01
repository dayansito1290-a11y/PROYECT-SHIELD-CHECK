import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, formatWhen } from "../api";
import { useAuth } from "../auth";
import { Button, Card, ErrorNote, Field, Modal, PageIntro, inputClass } from "../components/ui";
import type { Supervisor } from "../types";

const emptyForm = { name: "", email: "", password: "demo" };

export function SupervisorsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Supervisor[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<Record<number, { done: number; rate: number | null }>>({});

  function load() {
    api.supervisors().then(setRows).catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    load();
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    api.reports(iso(start), iso(end)).then((report) => {
      const next: Record<number, { done: number; rate: number | null }> = {};
      for (const person of report.by_supervisor) {
        next[person.id] = {
          done: report.rows.filter((row) => row.supervisor === person.name && row.status === "completada").length,
          rate: person.checks ? Math.round((person.compliance_rate ?? 0) * 100) : null,
        };
      }
      setPeriod(next);
    }).catch(() => setPeriod({}));
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((row) => `${row.name} ${row.email}`.toLowerCase().includes(text));
  }, [rows, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createSupervisor(form);
      setRows((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setForm(emptyForm);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Supervisores"
        text="Equipo que registra visitas en los centros de costo."
        action={
          user?.role === "coordinador" ? (
            <Button onClick={() => { setError(""); setOpen(true); }}>Nuevo supervisor</Button>
          ) : undefined
        }
      />
      <input
        className={inputClass}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre o correo"
      />
      {error && !open && <ErrorNote>{error}</ErrorNote>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-sand text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Visitas</th>
                <th className="px-4 py-3 font-medium">Completadas</th>
                <th className="px-4 py-3 font-medium">Cumplimiento</th>
                <th className="px-4 py-3 font-medium">Sin resolver</th>
                <th className="px-4 py-3 font-medium">Última visita</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand to-cyan text-[11px] font-bold text-white">
                        {row.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}
                      </span>
                      {row.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{row.visits > 0 ? "Con actividad" : "Sin visitas"}</td>
                  <td className="px-4 py-3">{row.visits}</td>
                  <td className="px-4 py-3">{period[row.id]?.done ?? "—"}</td>
                  <td className="px-4 py-3">{period[row.id]?.rate == null ? "—" : `${period[row.id]?.rate}%`}</td>
                  <td className="px-4 py-3">{row.open_novedades}</td>
                  <td className="px-4 py-3 text-muted">{formatWhen(row.last_visit_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/visitas?supervisor=${row.id}`} className="font-semibold text-brand">Ver visitas</Link>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">No hay supervisores con ese criterio.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} title="Nuevo supervisor" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nombre">
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Correo">
            <input className={inputClass} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </Field>
          <Field label="Contraseña inicial">
            <input className={inputClass} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={4} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy}>{busy ? "Guardando…" : "Crear supervisor"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
