export type Role = "supervisor" | "coordinador";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

export type CostCenter = {
  id: number;
  name: string;
  client: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  radius_m: number;
};

export type Check = {
  id: number;
  activity_id: number;
  name: string;
  description: string;
  result: "pendiente" | "cumple" | "incumple" | "no_aplica";
  notes: string;
};

export type Photo = {
  id: number;
  client_id?: string | null;
  url: string;
  caption: string;
  created_at: string;
};

export type FollowUp = {
  id: number;
  kind: "estado" | "comentario" | "accion";
  body: string;
  status: string | null;
  created_at: string;
  author: string;
};

export type Novedad = {
  id: number;
  title: string;
  description: string;
  severity: "baja" | "media" | "alta";
  status: "pendiente" | "en_revision" | "resuelta";
  created_at: string;
  client_id?: string | null;
  visit_id: number | null;
  cost_center: CostCenter;
  supervisor: User;
  followups?: FollowUp[];
};

export type NovedadAlert = {
  id: number;
  title: string;
  status: string;
  created_at: string;
  cost_center: string;
  supervisor: string;
};

export type Visit = {
  id: number;
  status: "en_curso" | "completada";
  started_at: string;
  ended_at: string | null;
  check_lat: number | null;
  check_lng: number | null;
  distance_m: number | null;
  location_valid: boolean;
  location_note: string;
  summary: string;
  client_id?: string | null;
  cost_center: CostCenter;
  supervisor: User;
  checks: Check[];
  photos: Photo[];
  novedades: Novedad[];
};

export type Assignment = {
  id: number;
  scheduled_for: string;
  status: "pendiente" | "en_curso" | "completada" | "cancelada";
  notes: string;
  created_at: string;
  visit_id: number | null;
  cost_center: CostCenter;
  supervisor: User;
};

export type Supervisor = User & {
  visits: number;
  open_novedades: number;
  last_visit_at: string | null;
  checks?: number;
  checks_cumple?: number;
  compliance_rate?: number;
};

export type Report = {
  start: string;
  end: string;
  visits: number;
  open_novedades: number;
  location_ok_rate: number;
  compliance_rate: number;
  checks_cumple: number;
  checks_incumple: number;
  by_supervisor: Supervisor[];
  rows: {
    id: number;
    started_at: string;
    status: string;
    location_valid: boolean;
    distance_m: number | null;
    center: string;
    supervisor: string;
    novedades: number;
    cumple: number;
    incumple: number;
  }[];
  novedades: {
    id: number;
    created_at: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    center: string;
    supervisor: string;
  }[];
};

export type Dashboard = {
  visits_today: number;
  visits_week: number;
  open_novedades: number;
  active_visits: number;
  location_ok_rate: number;
  cost_centers: number;
  supervisors: number;
  recent_visits: Visit[];
  novedades: Novedad[];
  by_center: {
    cost_center: CostCenter;
    visits: number;
    last_visit_at: string | null;
    open_novedades: number;
  }[];
};
