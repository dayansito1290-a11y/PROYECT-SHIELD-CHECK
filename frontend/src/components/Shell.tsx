import {
  Bell,
  Building2,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useOffline } from "../offline/status";
import type { NovedadAlert } from "../types";
import { Logo } from "./Logo";

const coordinatorLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/visitas", label: "Supervisiones", icon: ClipboardList },
  { to: "/centros", label: "Centros de costo", icon: Building2 },
  { to: "/supervisores", label: "Supervisores", icon: Users },
  { to: "/novedades", label: "Novedades", icon: TriangleAlert },
  { to: "/reportes", label: "Reportes", icon: FileBarChart },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

const supervisorLinks = [
  { to: "/", label: "Mi jornada", icon: LayoutDashboard },
  { to: "/visitas", label: "Mis visitas", icon: ClipboardList },
  { to: "/centros", label: "Centros", icon: Building2 },
  { to: "/novedades", label: "Novedades", icon: TriangleAlert },
  { to: "/configuracion", label: "Sincronización", icon: Settings },
];

function sectionTitle(pathname: string, field: boolean) {
  if (pathname.startsWith("/visitas/")) return field ? "Detalle de visita" : "Detalle de supervisión";
  if (pathname.startsWith("/visita/") || pathname === "/visita") return "Registrar visita";
  const links = field ? supervisorLinks : coordinatorLinks;
  const match = links.find((link) => (link.to === "/" ? pathname === "/" : pathname.startsWith(link.to)));
  return match?.label ?? "FieldCheck";
}

function crumbs(pathname: string, field: boolean) {
  if (pathname === "/") return field ? ["Campo", "Mi jornada"] : ["Operaciones", "Dashboard"];
  if (pathname.startsWith("/visitas/")) return [field ? "Mis visitas" : "Supervisiones", "Detalle"];
  if (pathname.startsWith("/visita/") || pathname === "/visita") return ["Mis visitas", "Registro"];
  return [field ? "Campo" : "Operaciones", sectionTitle(pathname, field)];
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const net = useOffline();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState<NovedadAlert[]>([]);

  useEffect(() => {
    setOpen(false);
    setNotesOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    api.novedadAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, [user, location.pathname]);

  function search(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    navigate(text ? `/visitas?q=${encodeURIComponent(text)}` : "/visitas");
  }

  const field = user?.role === "supervisor";
  const links = field ? supervisorLinks : coordinatorLinks;
  const trail = crumbs(location.pathname, field);

  return (
    <div className={`min-h-screen ${field ? "bg-sand" : "bg-[#eef3f8]"}`}>
      {open && (
        <button className="fixed inset-0 z-30 bg-brand-dark/40 lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r transition-transform lg:translate-x-0 ${
          field ? "border-line bg-white text-ink" : "border-white/10 bg-brand-dark text-white"
        } ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo className="h-16 w-auto max-w-[180px]" />
          <button className={`rounded-lg p-1 lg:hidden ${field ? "text-muted" : "text-slate-300"}`} onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
                  field ? "min-h-12 py-3" : "py-2.5"
                } ${
                  isActive
                    ? field
                      ? "bg-cyan text-white"
                      : "bg-cyan/20 text-white shadow-inner"
                    : field
                      ? "text-ink hover:bg-sand"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <link.icon size={18} />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className={`border-t p-4 ${field ? "border-line" : "border-white/10"}`}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-cyan">{field ? "En campo" : "Centro de control"}</p>
          <p className="mt-2 flex items-center gap-2 text-xs font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${net.online ? "bg-emerald-400" : "bg-amber-300"}`} />
            {net.online ? "Sistema operativo" : "Sin conexión"}
          </p>
          <p className="mt-3 text-sm font-semibold">{user?.name}</p>
          <p className={`text-xs capitalize ${field ? "text-muted" : "text-slate-400"}`}>{user?.role}</p>
          <button onClick={logout} className={`mt-3 flex items-center gap-2 text-sm ${field ? "text-muted hover:text-ink" : "text-slate-300 hover:text-white"}`}>
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </aside>

      <div className={field ? "lg:pl-72" : "lg:pl-72"}>
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button className={`rounded-lg p-2 text-ink hover:bg-sand lg:hidden ${field ? "hidden" : ""}`} onClick={() => setOpen(true)} aria-label="Abrir menú">
                <Menu size={20} />
              </button>
              <Logo className="h-9 w-auto lg:hidden" />
              <div className="min-w-0">
                <p className="truncate text-xs text-muted">{trail.join(" / ")}</p>
                <p className="truncate text-sm font-bold text-brand-dark">{sectionTitle(location.pathname, field)}</p>
              </div>
            </div>
            <form onSubmit={search} className={`${field ? "hidden" : "hidden min-w-0 flex-1 items-center md:flex md:max-w-sm md:px-4"}`}>
              <label className="relative w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar supervisión"
                  className="w-full rounded-xl border border-line bg-sand py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan focus:bg-white"
                />
              </label>
            </form>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <button className="relative rounded-xl p-2 text-ink hover:bg-sand" aria-label="Notificaciones" onClick={() => setNotesOpen((value) => !value)}>
                  <Bell size={18} />
                  {alerts.length > 0 && (
                    <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-cyan px-1 text-[10px] font-bold text-white">
                      {alerts.length}
                    </span>
                  )}
                </button>
                {notesOpen && (
                  <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-xl">
                    <p className="px-2 py-1 text-xs font-semibold text-muted">Prioridad alta sin resolver</p>
                    {alerts.length === 0 && <p className="px-2 py-3 text-sm text-muted">No hay alertas.</p>}
                    {alerts.slice(0, 5).map((alert) => (
                      <Link key={alert.id} to="/novedades?prioridad=alta" className="block rounded-xl px-2 py-2 hover:bg-sand">
                        <span className="block text-sm font-semibold">{alert.title}</span>
                        <span className="text-xs text-muted">{alert.cost_center}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="hidden text-right sm:block">
                <p className={`text-xs font-semibold ${net.online ? "text-ok" : "text-warn"}`}>{net.online ? "En línea" : "Sin conexión"}</p>
                <p className="text-xs text-muted">
                  {net.syncing ? "Sincronizando…" : net.pending > 0 ? `${net.pending} por enviar` : "Al día"}
                </p>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-cyan text-xs font-bold text-white">
                {user ? initials(user.name) : "FC"}
              </div>
              <div className="hidden text-right lg:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs capitalize text-muted">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>
        {!net.online && (
          <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-ink lg:px-8">
            Sin conexión — Los registros se guardarán y sincronizarán automáticamente.
          </p>
        )}
        {net.online && net.syncing && (
          <p className="border-b border-cyan/20 bg-cyan/10 px-4 py-2 text-sm text-brand lg:px-8">
            Conexión restaurada — Sincronizando registros...
          </p>
        )}
        {net.online && !net.syncing && net.pending === 0 && net.confirmation && (
          <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-ok lg:px-8">Todo sincronizado</p>
        )}
        {net.lastError && net.pending > 0 && (
          <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-bad lg:px-8">
            No se pudo sincronizar: {net.lastError}. El registro sigue en este dispositivo y se reintentará.
          </p>
        )}
        <main className={`mx-auto w-full px-4 py-5 lg:px-8 lg:py-8 ${field ? "max-w-3xl pb-28 lg:max-w-5xl lg:pb-8" : "max-w-[1440px]"}`}>{children}</main>
        {field && (
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white lg:hidden">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold ${isActive ? "text-cyan" : "text-muted"}`
                }
              >
                <link.icon size={18} />
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
