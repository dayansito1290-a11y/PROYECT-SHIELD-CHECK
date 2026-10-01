import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatWhen } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageIntro, SuccessNote, inputClass, statusLabel, statusTone } from "../components/ui";
import type { CostCenter, Novedad, Supervisor } from "../types";

const statuses = ["pendiente", "en_revision", "resuelta"] as const;

function csv(rows: Novedad[]) {
  const header = ["Fecha", "Título", "Descripción", "Prioridad", "Estado", "Centro", "Supervisor"];
  const lines = rows.map((item) => [
    item.created_at,
    item.title,
    item.description,
    statusLabel(item.severity),
    statusLabel(item.status),
    item.cost_center.name,
    item.supervisor.name,
  ]);
  const content = [header, ...lines]
    .map((cols) => cols.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "novedades.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function NovedadesPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [items, setItems] = useState<Novedad[]>([]);
  const [people, setPeople] = useState<Supervisor[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState(params.get("prioridad") ?? "");
  const [status, setStatus] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState<Novedad | null>(null);
  const [nextStatus, setNextStatus] = useState("pendiente");
  const [comment, setComment] = useState("");
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function currentFilters() {
    return { severity, status, supervisor_id: supervisorId, cost_center_id: centerId, start, end };
  }

  function load(next = currentFilters()) {
    setLoading(true);
    setError("");
    api
      .novedades(next)
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const initial = params.get("prioridad") ?? "";
    setSeverity(initial);
    load({ severity: initial, status: "", supervisor_id: "", cost_center_id: "", start: "", end: "" });
    api.supervisors().then(setPeople).catch(() => setPeople([]));
    api.centers().then(setCenters).catch(() => setCenters([]));
  }, [params]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return items;
    return items.filter((item) => `${item.title} ${item.description} ${item.cost_center.name} ${item.supervisor.name}`.toLowerCase().includes(text));
  }, [items, query]);

  function replaceItem(updated: Novedad) {
    setItems((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    setSelected(updated);
  }

  async function openItem(item: Novedad) {
    setNotice("");
    setError("");
    setComment("");
    setAction("");
    setNextStatus(item.status);
    setSelected(item);
    setBusy(true);
    try {
      const detail = await api.novedad(item.id);
      setSelected(detail);
      setNextStatus(detail.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la novedad");
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api.updateNovedad(selected.id, nextStatus);
      replaceItem(updated);
      setNotice("Estado actualizado y guardado en el historial.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el estado");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(event: FormEvent, kind: "comentario" | "accion") {
    event.preventDefault();
    if (!selected) return;
    const body = kind === "comentario" ? comment : action;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api.addFollowUp(selected.id, kind, body);
      replaceItem(updated);
      if (kind === "comentario") setComment("");
      else setAction("");
      setNotice(kind === "comentario" ? "Comentario registrado." : "Acción registrada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el seguimiento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Novedades"
        text={user?.role === "supervisor" ? "Hallazgos que registraste en tus visitas." : "Consulta, filtra y da seguimiento a los hallazgos de las visitas."}
        action={
          <Button variant="secondary" disabled={visible.length === 0} onClick={() => csv(visible)}>
            Exportar CSV
          </Button>
        }
      />
      {visible.some((item) => item.severity === "alta" && item.status !== "resuelta") && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-ink">
          Hay {visible.filter((item) => item.severity === "alta" && item.status !== "resuelta").length}{" "}
          {visible.filter((item) => item.severity === "alta" && item.status !== "resuelta").length === 1 ? "novedad" : "novedades"} de prioridad alta sin resolver.
        </p>
      )}
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="Prioridad">
          <select className={inputClass} value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </Field>
        <Field label="Estado">
          <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {statuses.map((item) => (
              <option key={item} value={item}>{statusLabel(item)}</option>
            ))}
          </select>
        </Field>
        {user?.role !== "supervisor" && <Field label="Supervisor">
          <select className={inputClass} value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)}>
            <option value="">Todos</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </Field>}
        <Field label="Centro de costo">
          <select className={inputClass} value={centerId} onChange={(event) => setCenterId(event.target.value)}>
            <option value="">Todos</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>{center.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Desde">
          <input className={inputClass} type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="Hasta">
          <input className={inputClass} type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
        <div className="md:col-span-3">
          <Button disabled={loading} onClick={() => load()}>{loading ? "Consultando…" : "Aplicar filtros"}</Button>
        </div>
      </Card>
      <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en los resultados" />
      {error && !selected && <ErrorNote>{error}</ErrorNote>}
      {loading && <p className="text-sm text-muted">Cargando novedades…</p>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-sand text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Título</th>
                <th className="px-4 py-3 font-medium">Centro</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const alert = item.severity === "alta" && item.status !== "resuelta";
                return (
                  <tr key={item.id} className={`border-t border-line ${alert ? "border-l-4 border-l-amber-400 bg-amber-50/60" : ""}`}>
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3">{item.cost_center.name}</td>
                    <td className="px-4 py-3">{item.supervisor.name}</td>
                    <td className="px-4 py-3 text-muted">{formatWhen(item.created_at)}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(item.severity)}>{statusLabel(item.severity)}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button className="font-semibold text-brand" onClick={() => openItem(item)}>Ver seguimiento</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">No hay novedades con esos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={selected !== null} title={selected?.title ?? "Novedad"} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone={statusTone(selected.severity)}>{statusLabel(selected.severity)}</Badge>
              <Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>
            </div>
            <p>{selected.description}</p>
            <p className="text-muted">
              {selected.cost_center.name} · {selected.supervisor.name} · {formatWhen(selected.created_at)}
            </p>
            {selected.visit_id && (
              <Link to={`/visitas/${selected.visit_id}`} className="inline-flex font-semibold text-brand" onClick={() => setSelected(null)}>
                Abrir visita
              </Link>
            )}
            {user?.role === "coordinador" && (
              <div className="space-y-3 rounded-xl border border-line p-3">
                <Field label="Estado">
                  <select className={inputClass} value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} disabled={busy}>
                    {statuses.map((item) => (
                      <option key={item} value={item}>{statusLabel(item)}</option>
                    ))}
                  </select>
                </Field>
                <Button disabled={busy || nextStatus === selected.status} onClick={saveStatus}>
                  {busy ? "Guardando…" : "Guardar estado"}
                </Button>
                <form className="space-y-2" onSubmit={(event) => saveNote(event, "comentario")}>
                  <Field label="Comentario">
                    <textarea className={inputClass} rows={2} value={comment} onChange={(event) => setComment(event.target.value)} required minLength={3} disabled={busy} />
                  </Field>
                  <Button variant="secondary" disabled={busy}>Agregar comentario</Button>
                </form>
                <form className="space-y-2" onSubmit={(event) => saveNote(event, "accion")}>
                  <Field label="Acción realizada">
                    <textarea className={inputClass} rows={2} value={action} onChange={(event) => setAction(event.target.value)} required minLength={3} disabled={busy} />
                  </Field>
                  <Button variant="secondary" disabled={busy}>Registrar acción</Button>
                </form>
              </div>
            )}
            {notice && <SuccessNote>{notice}</SuccessNote>}
            {error && <ErrorNote>{error}</ErrorNote>}
            <div>
              <p className="font-semibold">Historial de seguimiento</p>
              <ul className="mt-2 space-y-2">
                {(selected.followups ?? []).length === 0 && <li className="text-muted">Todavía no hay seguimiento.</li>}
                {(selected.followups ?? []).map((entry) => (
                  <li key={entry.id} className="rounded-xl bg-sand px-3 py-2">
                    <p className="font-medium">
                      {entry.kind === "accion" ? "Acción" : entry.kind === "comentario" ? "Comentario" : "Estado"}
                      <span className="font-normal text-muted"> · {entry.author} · {formatWhen(entry.created_at)}</span>
                    </p>
                    <p className="mt-1">{entry.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
