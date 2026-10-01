import { useAuth } from "../auth";
import { Logo } from "../components/Logo";
import { Button, Card, PageIntro } from "../components/ui";
import { useOffline } from "../offline/status";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const net = useOffline();

  return (
    <div className="space-y-5">
      <PageIntro title="Configuración" text="Tu sesión y el estado de sincronización de este dispositivo." />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="grid place-items-center p-6">
          <Logo className="h-24 w-auto" />
        </Card>
        <Card className="space-y-3 p-5 text-sm">
          <p><span className="text-muted">Nombre. </span><span className="font-semibold">{user?.name}</span></p>
          <p><span className="text-muted">Correo. </span>{user?.email}</p>
          <p><span className="text-muted">Rol. </span><span className="capitalize">{user?.role}</span></p>
          <p><span className="text-muted">Conexión. </span>{net.online ? "En línea" : "Sin conexión"}</p>
          <p><span className="text-muted">Registros por sincronizar. </span>{net.pending}</p>
          <Button variant="secondary" onClick={logout}>Cerrar sesión</Button>
        </Card>
      </div>
    </div>
  );
}
