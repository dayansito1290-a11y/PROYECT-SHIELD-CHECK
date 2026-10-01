import { X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "brand";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    ok: "bg-emerald-50 text-ok",
    warn: "bg-amber-50 text-warn",
    bad: "bg-red-50 text-bad",
    brand: "bg-blue-50 text-brand",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string) {
  if (status === "completada" || status === "resuelta" || status === "cerrada" || status === "cumple") return "ok" as const;
  if (status === "en_curso" || status === "en_revision" || status === "en_seguimiento" || status === "media") return "warn" as const;
  if (status === "pendiente" || status === "abierta" || status === "alta" || status === "incumple") return "bad" as const;
  return "neutral" as const;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    en_curso: "En curso",
    completada: "Completada",
    cancelada: "Cancelada",
    pendiente: "Pendiente",
    en_revision: "En revisión",
    resuelta: "Resuelta",
    abierta: "Pendiente",
    en_seguimiento: "En revisión",
    cerrada: "Resuelta",
    baja: "Baja",
    media: "Media",
    alta: "Alta",
    cumple: "Cumple",
    no_aplica: "No aplica",
    incumple: "Incumple",
  };
  return labels[status] ?? status;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white shadow-sm ${className}`}>{children}</section>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const variants = {
    primary: "bg-gradient-to-r from-brand to-cyan text-white shadow-sm hover:brightness-110",
    secondary: "border border-line bg-white text-ink hover:border-cyan hover:bg-sand",
    ghost: "text-brand hover:bg-cyan/10",
    danger: "bg-bad text-white hover:brightness-110",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-cyan focus:ring-2 focus:ring-cyan/20";

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-bad">{children}</p>;
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-ok">{children}</p>;
}

export function PageIntro({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {text && <p className="mt-1 max-w-2xl text-sm text-muted">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-dark/55 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-white shadow-2xl sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-sand" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <PageIntro title={title} text={text} action={action} />;
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand/10 to-cyan/20 text-brand">{icon}</span>}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-brand-dark">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <Empty title={title} text={text} />;
}
