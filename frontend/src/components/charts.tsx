export function Donut({ value, label }: { value: number | null; label: string }) {
  const safe = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-4">
      <div
        className="grid h-28 w-28 place-items-center rounded-full"
        style={{ background: `conic-gradient(#059669 ${safe * 3.6}deg, #e2e8f0 0deg)` }}
      >
        <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-lg font-bold text-ink">
          {value == null ? "—" : `${Math.round(safe)}%`}
        </div>
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.every((item) => item.value === 0)) {
    return <p className="text-sm text-muted">No hay registros en este periodo.</p>;
  }
  return (
    <div className="flex h-44 items-end gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-xs font-semibold text-ink">{item.value}</span>
          <div className="flex h-32 w-full items-end">
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-brand to-cyan"
              style={{ height: `${Math.max(6, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function SplitBar({ ok, bad, okLabel, badLabel }: { ok: number; bad: number; okLabel: string; badLabel: string }) {
  const total = ok + bad;
  if (!total) return <p className="text-sm text-muted">No hay actividades evaluadas en este periodo.</p>;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-sand">
        <div className="bg-ok" style={{ width: `${(ok / total) * 100}%` }} />
        <div className="bg-gradient-to-r from-cyan to-brand" style={{ width: `${(bad / total) * 100}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <span className="font-semibold text-ok">{ok} {okLabel}</span>
        <span className="font-semibold text-brand">{bad} {badLabel}</span>
      </div>
    </div>
  );
}
