import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { CentersPage } from "./pages/Centers";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { NovedadesPage } from "./pages/Novedades";
import { ReportsPage } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { SupervisorsPage } from "./pages/Supervisors";
import { VisitDetailPage } from "./pages/VisitDetail";
import { VisitFlow } from "./pages/VisitFlow";
import { VisitListPage } from "./pages/VisitList";

function Guard({ children, role }: { children: ReactNode; role?: "supervisor" | "coordinador" }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-sm text-muted">Cargando…</p>;
  if (!user) return <Navigate to="/ingresar" replace />;
  if (role && user.role !== role) return <Navigate to="/visitas" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/ingresar" element={loading ? null : user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<Guard><DashboardPage /></Guard>} />
      <Route path="/supervisores" element={<Guard><SupervisorsPage /></Guard>} />
      <Route path="/centros" element={<Guard><CentersPage /></Guard>} />
      <Route path="/visitas" element={<Guard><VisitListPage /></Guard>} />
      <Route path="/visitas/:id" element={<Guard><VisitDetailPage /></Guard>} />
      <Route path="/novedades" element={<Guard><NovedadesPage /></Guard>} />
      <Route path="/reportes" element={<Guard><ReportsPage /></Guard>} />
      <Route path="/configuracion" element={<Guard><SettingsPage /></Guard>} />
      <Route path="/visita" element={<Guard role="supervisor"><VisitFlow /></Guard>} />
      <Route path="/visita/local/:clientId" element={<Guard role="supervisor"><VisitFlow /></Guard>} />
      <Route path="/visita/:id" element={<Guard role="supervisor"><VisitFlow /></Guard>} />
      <Route path="/historial" element={<Navigate to="/visitas" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
