import math
import secrets
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from app.db import (
    BOGOTA,
    Activity,
    Assignment,
    CostCenter,
    Novedad,
    NovedadFollowUp,
    Photo,
    Session,
    SessionLocal,
    User,
    Visit,
    VisitCheck,
    Base,
    engine,
    ensure_assignments,
    ensure_demo_day,
    ensure_followups,
    ensure_schema,
    ensure_team,
    hash_password,
    now,
    seed,
)

UPLOADS = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Supervisión Inteligente de Servicios en Campo",
    version="1.0.0",
    description=(
        "API para usuarios, centros de costo, asignaciones, visitas, actividades, "
        "novedades y evidencias fotográficas. La documentación interactiva está en /docs."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(
    authorization: str | None = Header(default=None),
    db: DbSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sesión requerida")
    token = authorization.removeprefix("Bearer ").strip()
    session = db.get(Session, token)
    if not session:
        raise HTTPException(status_code=401, detail="Sesión inválida")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def require_supervisor(user: User = Depends(current_user)) -> User:
    if user.role != "supervisor":
        raise HTTPException(status_code=403, detail="Solo el supervisor puede registrar visitas")
    return user


def require_coordinator(user: User = Depends(current_user)) -> User:
    if user.role != "coordinador":
        raise HTTPException(status_code=403, detail="Solo coordinación puede hacer este cambio")
    return user


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def as_bogota(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=BOGOTA)
    return value.astimezone(BOGOTA)


def client_time(value: datetime | None) -> datetime:
    current = now()
    if value is None:
        return current
    recorded = as_bogota(value)
    if recorded > current + timedelta(minutes=2):
        return current
    return recorded


class LoginIn(BaseModel):
    email: str
    password: str


class CheckIn(BaseModel):
    result: str = Field(pattern="^(cumple|incumple|no_aplica|pendiente)$")
    notes: str = ""
    recorded_at: datetime | None = None


class VisitIn(BaseModel):
    cost_center_id: int
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    location_note: str = ""
    assignment_id: int | None = None
    client_id: str | None = Field(default=None, min_length=8, max_length=64)
    recorded_at: datetime | None = None


class NovedadIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=3)
    severity: str = Field(pattern="^(baja|media|alta)$")
    client_id: str | None = Field(default=None, min_length=8, max_length=64)
    recorded_at: datetime | None = None


class NovedadStatusIn(BaseModel):
    status: str | None = Field(default=None, pattern="^(pendiente|en_revision|resuelta)$")
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, min_length=3)
    severity: str | None = Field(default=None, pattern="^(baja|media|alta)$")


class FollowUpIn(BaseModel):
    kind: str = Field(pattern="^(comentario|accion)$")
    body: str = Field(min_length=3, max_length=1000)


class VisitUpdate(BaseModel):
    summary: str | None = None
    location_note: str | None = None


class PhotoUpdate(BaseModel):
    caption: str = Field(max_length=200)


class SupervisorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    email: str | None = Field(default=None, min_length=5, max_length=180)
    password: str | None = Field(default=None, min_length=4, max_length=80)


class CenterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=160)
    client: str | None = Field(default=None, min_length=2, max_length=160)
    address: str | None = Field(default=None, min_length=3, max_length=240)
    city: str | None = Field(default=None, min_length=2, max_length=80)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    radius_m: int | None = Field(default=None, ge=30, le=2000)


class AssignmentIn(BaseModel):
    supervisor_id: int
    cost_center_id: int
    scheduled_for: datetime
    notes: str = Field(default="", max_length=400)


class AssignmentUpdate(BaseModel):
    supervisor_id: int | None = None
    cost_center_id: int | None = None
    scheduled_for: datetime | None = None
    notes: str | None = Field(default=None, max_length=400)
    status: str | None = Field(default=None, pattern="^(pendiente|en_curso|completada|cancelada)$")


class CloseIn(BaseModel):
    summary: str = ""
    recorded_at: datetime | None = None


class SupervisorIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    email: str = Field(min_length=5, max_length=180)
    password: str = Field(min_length=4, max_length=80)


class CenterIn(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    client: str = Field(min_length=2, max_length=160)
    address: str = Field(min_length=3, max_length=240)
    city: str = Field(default="Bogotá", min_length=2, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=200, ge=30, le=2000)


def user_out(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


def center_out(center: CostCenter) -> dict:
    return {
        "id": center.id,
        "name": center.name,
        "client": center.client,
        "address": center.address,
        "city": center.city,
        "lat": center.lat,
        "lng": center.lng,
        "radius_m": center.radius_m,
    }


def visit_out(visit: Visit) -> dict:
    checks = sorted(visit.checks, key=lambda item: item.activity.sort_order)
    return {
        "id": visit.id,
        "status": visit.status,
        "started_at": visit.started_at.isoformat(),
        "ended_at": visit.ended_at.isoformat() if visit.ended_at else None,
        "check_lat": visit.check_lat,
        "check_lng": visit.check_lng,
        "distance_m": visit.distance_m,
        "location_valid": visit.location_valid,
        "location_note": visit.location_note,
        "summary": visit.summary,
        "assignment_id": visit.assignment_id,
        "client_id": visit.client_id,
        "cost_center": center_out(visit.cost_center),
        "supervisor": user_out(visit.supervisor),
        "checks": [
            {
                "id": check.id,
                "activity_id": check.activity_id,
                "name": check.activity.name,
                "description": check.activity.description,
                "result": check.result,
                "notes": check.notes,
            }
            for check in checks
        ],
        "photos": [
            {
                "id": photo.id,
                "client_id": photo.client_id,
                "url": f"/uploads/{photo.filename}",
                "caption": photo.caption,
                "created_at": photo.created_at.isoformat(),
            }
            for photo in visit.photos
        ],
        "novedades": [novedad_out(item) for item in visit.novedades],
    }


def followup_out(row: NovedadFollowUp) -> dict:
    return {
        "id": row.id,
        "kind": row.kind,
        "body": row.body,
        "status": row.status,
        "created_at": row.created_at.isoformat(),
        "author": row.author.name,
    }


STATUS_LABELS = {"pendiente": "Pendiente", "en_revision": "En revisión", "resuelta": "Resuelta"}


def novedad_open(status: str) -> bool:
    return status not in {"resuelta", "cerrada"}


def parse_day(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Usa fechas con formato AAAA-MM-DD") from error


def novedad_out(item: Novedad) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "severity": item.severity,
        "status": item.status,
        "created_at": item.created_at.isoformat(),
        "client_id": item.client_id,
        "visit_id": item.visit_id,
        "followups": [followup_out(row) for row in item.__dict__.get("followups", [])],
        "cost_center": center_out(item.cost_center),
        "supervisor": user_out(item.supervisor),
    }


def assignment_out(item: Assignment) -> dict:
    return {
        "id": item.id,
        "scheduled_for": item.scheduled_for.isoformat(),
        "status": item.status,
        "notes": item.notes,
        "created_at": item.created_at.isoformat(),
        "visit_id": item.visit.id if item.visit else None,
        "cost_center": center_out(item.cost_center),
        "supervisor": user_out(item.supervisor),
    }


def load_assignment(db: DbSession, assignment_id: int) -> Assignment:
    item = (
        db.query(Assignment)
        .options(
            selectinload(Assignment.cost_center),
            selectinload(Assignment.supervisor),
            selectinload(Assignment.visit),
        )
        .filter(Assignment.id == assignment_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    return item


def take_supervisor(db: DbSession, supervisor_id: int) -> User:
    person = db.get(User, supervisor_id)
    if not person or person.role != "supervisor":
        raise HTTPException(status_code=404, detail="Supervisor no encontrado")
    return person


def take_center(db: DbSession, center_id: int) -> CostCenter:
    center = db.get(CostCenter, center_id)
    if not center:
        raise HTTPException(status_code=404, detail="Centro de costo no encontrado")
    return center


def load_visit(db: DbSession, visit_id: int) -> Visit:
    visit = (
        db.query(Visit)
        .options(
            selectinload(Visit.cost_center),
            selectinload(Visit.assignment),
            selectinload(Visit.supervisor),
            selectinload(Visit.checks).selectinload(VisitCheck.activity),
            selectinload(Visit.photos),
            selectinload(Visit.novedades).selectinload(Novedad.cost_center),
            selectinload(Visit.novedades).selectinload(Novedad.supervisor),
        )
        .filter(Visit.id == visit_id)
        .first()
    )
    if not visit:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    return visit


def can_see(user: User, visit: Visit) -> None:
    if user.role == "supervisor" and visit.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No puedes ver esta visita")


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    ensure_schema()
    seed()
    ensure_team()
    ensure_assignments()
    ensure_demo_day()
    ensure_followups()


@app.exception_handler(RequestValidationError)
async def invalid_payload(_: Request, exc: RequestValidationError):
    error = exc.errors()[0] if exc.errors() else {}
    location = [str(part) for part in error.get("loc", []) if part != "body"]
    message = error.get("msg", "Datos inválidos")
    detail = f"{'.'.join(location)}: {message}" if location else "Datos inválidos"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/auth/login")
def login(body: LoginIn, db: DbSession = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or user.password_hash != hash_password(body.password):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    token = secrets.token_urlsafe(32)
    db.add(Session(token=token, user_id=user.id, created_at=now()))
    db.commit()
    return {"token": token, "user": user_out(user)}


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@app.get("/api/cost-centers")
def cost_centers(_: User = Depends(current_user), db: DbSession = Depends(get_db)):
    centers = db.query(CostCenter).order_by(CostCenter.name).all()
    return [center_out(center) for center in centers]


@app.get("/api/activities")
def activities(_: User = Depends(current_user), db: DbSession = Depends(get_db)):
    rows = db.query(Activity).order_by(Activity.sort_order).all()
    return [{"id": row.id, "name": row.name, "description": row.description} for row in rows]


@app.get("/api/visits")
def list_visits(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    query = db.query(Visit).options(
        selectinload(Visit.cost_center),
        selectinload(Visit.supervisor),
        selectinload(Visit.checks).selectinload(VisitCheck.activity),
        selectinload(Visit.photos),
        selectinload(Visit.novedades).selectinload(Novedad.cost_center),
        selectinload(Visit.novedades).selectinload(Novedad.supervisor),
    )
    visits = query.order_by(Visit.started_at.desc()).all()
    if user.role == "supervisor":
        visits = [visit for visit in visits if visit.supervisor_id == user.id]
    return [visit_out(visit) for visit in visits]


@app.get("/api/visits/{visit_id}")
def get_visit(visit_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    return visit_out(visit)


def apply_check(check: VisitCheck, body: CheckIn) -> bool:
    incoming = client_time(body.recorded_at)
    current = as_bogota(check.updated_at) if check.updated_at else None
    if current and incoming < current:
        return False
    check.result = body.result
    check.notes = body.notes.strip()
    check.updated_at = incoming
    return True


def existing_visit(db: DbSession, client_id: str | None, user: User) -> Visit | None:
    if not client_id:
        return None
    found = db.query(Visit).filter(Visit.client_id == client_id).first()
    if not found:
        return None
    if found.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="Ese identificador pertenece a otra visita")
    return found


@app.post("/api/visits")
def create_visit(body: VisitIn, user: User = Depends(require_supervisor), db: DbSession = Depends(get_db)):
    previous = existing_visit(db, body.client_id, user)
    if previous:
        return visit_out(load_visit(db, previous.id))
    active = (
        db.query(Visit)
        .filter(Visit.supervisor_id == user.id, Visit.status == "en_curso")
        .first()
    )
    if active:
        raise HTTPException(status_code=409, detail="Ya tienes una visita en curso")
    center = db.get(CostCenter, body.cost_center_id)
    if not center:
        raise HTTPException(status_code=404, detail="Centro de costo no encontrado")

    distance = haversine_m(body.lat, body.lng, center.lat, center.lng)
    valid = distance <= center.radius_m
    assignment = None
    if body.assignment_id is not None:
        assignment = db.get(Assignment, body.assignment_id)
        if not assignment or assignment.supervisor_id != user.id:
            raise HTTPException(status_code=404, detail="Asignación no encontrada")
        if assignment.cost_center_id != center.id:
            raise HTTPException(status_code=400, detail="La asignación no corresponde a este centro")
        if assignment.status not in {"pendiente", "en_curso"}:
            raise HTTPException(status_code=400, detail="La asignación ya no está disponible")
    else:
        assignment = (
            db.query(Assignment)
            .filter(
                Assignment.supervisor_id == user.id,
                Assignment.cost_center_id == center.id,
                Assignment.status == "pendiente",
            )
            .order_by(Assignment.scheduled_for)
            .first()
        )
    visit = Visit(
        cost_center_id=center.id,
        supervisor_id=user.id,
        status="en_curso",
        started_at=client_time(body.recorded_at),
        check_lat=body.lat,
        check_lng=body.lng,
        distance_m=round(distance, 1),
        location_valid=valid,
        location_note=body.location_note.strip(),
        assignment_id=assignment.id if assignment else None,
        client_id=body.client_id,
    )
    if assignment:
        assignment.status = "en_curso"
    db.add(visit)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        previous = existing_visit(db, body.client_id, user)
        if previous:
            return visit_out(load_visit(db, previous.id))
        raise
    for activity in db.query(Activity).order_by(Activity.sort_order).all():
        db.add(VisitCheck(visit_id=visit.id, activity_id=activity.id, result="pendiente"))
    db.commit()
    return visit_out(load_visit(db, visit.id))


@app.patch("/api/visits/{visit_id}/checks/{check_id}")
def update_check(
    visit_id: int,
    check_id: int,
    body: CheckIn,
    user: User = Depends(require_supervisor),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    if visit.status != "en_curso":
        raise HTTPException(status_code=400, detail="La visita ya está cerrada")
    check = next((item for item in visit.checks if item.id == check_id), None)
    if not check:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    apply_check(check, body)
    db.commit()
    return visit_out(load_visit(db, visit_id))


@app.patch("/api/visits/{visit_id}/activities/{activity_id}")
def update_check_by_activity(
    visit_id: int,
    activity_id: int,
    body: CheckIn,
    user: User = Depends(require_supervisor),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    if visit.status != "en_curso":
        raise HTTPException(status_code=400, detail="La visita ya está cerrada")
    check = next((item for item in visit.checks if item.activity_id == activity_id), None)
    if not check:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    apply_check(check, body)
    db.commit()
    return visit_out(load_visit(db, visit_id))


@app.post("/api/visits/{visit_id}/photos")
def upload_photo(
    visit_id: int,
    caption: str = Form(default=""),
    client_id: str = Form(default=""),
    recorded_at: str = Form(default=""),
    file: UploadFile = File(...),
    user: User = Depends(require_supervisor),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    marker = client_id.strip() or None
    if marker:
        existing = db.query(Photo).filter(Photo.client_id == marker).first()
        if existing:
            if existing.visit_id != visit.id:
                raise HTTPException(status_code=409, detail="Esa evidencia ya pertenece a otra visita")
            return visit_out(load_visit(db, visit_id))
    if visit.status != "en_curso":
        raise HTTPException(status_code=400, detail="La visita ya está cerrada")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")
    suffix = Path(file.filename or "foto.jpg").suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".jpg"
    filename = f"{secrets.token_hex(12)}{suffix}"
    target = UPLOADS / filename
    with target.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)
    taken = now()
    if recorded_at.strip():
        taken = client_time(datetime.fromisoformat(recorded_at.strip()))
    db.add(
        Photo(
            visit_id=visit.id,
            filename=filename,
            caption=caption.strip(),
            created_at=taken,
            client_id=marker,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        target.unlink(missing_ok=True)
        existing = db.query(Photo).filter(Photo.client_id == marker).first() if marker else None
        if existing and existing.visit_id == visit.id:
            return visit_out(load_visit(db, visit_id))
        raise
    return visit_out(load_visit(db, visit_id))


@app.post("/api/visits/{visit_id}/novedades")
def create_novedad(
    visit_id: int,
    body: NovedadIn,
    user: User = Depends(require_supervisor),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    if body.client_id:
        existing = db.query(Novedad).filter(Novedad.client_id == body.client_id).first()
        if existing:
            if existing.visit_id != visit.id:
                raise HTTPException(status_code=409, detail="Esa novedad ya pertenece a otra visita")
            incoming = client_time(body.recorded_at)
            if incoming > as_bogota(existing.created_at):
                existing.title = body.title.strip()
                existing.description = body.description.strip()
                existing.severity = body.severity
                existing.created_at = incoming
                db.commit()
            return visit_out(load_visit(db, visit_id))
    if visit.status != "en_curso":
        raise HTTPException(status_code=400, detail="La visita ya está cerrada")
    novedad = Novedad(
        visit_id=visit.id,
        cost_center_id=visit.cost_center_id,
        supervisor_id=user.id,
        title=body.title.strip(),
        description=body.description.strip(),
        severity=body.severity,
        status="pendiente",
        created_at=client_time(body.recorded_at),
        client_id=body.client_id,
    )
    db.add(novedad)
    try:
        db.flush()
        db.add(
            NovedadFollowUp(
                novedad_id=novedad.id,
                user_id=user.id,
                kind="estado",
                body="Novedad registrada",
                status="pendiente",
                created_at=novedad.created_at,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        return visit_out(load_visit(db, visit_id))
    return visit_out(load_visit(db, visit_id))


@app.post("/api/visits/{visit_id}/close")
def close_visit(
    visit_id: int,
    body: CloseIn,
    user: User = Depends(require_supervisor),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    incoming = client_time(body.recorded_at)
    if visit.status != "en_curso":
        ended = as_bogota(visit.ended_at) if visit.ended_at else None
        if ended and incoming > ended:
            visit.summary = body.summary.strip()
            visit.ended_at = incoming
            db.commit()
        return visit_out(load_visit(db, visit_id))
    if any(check.result == "pendiente" for check in visit.checks):
        raise HTTPException(status_code=400, detail="Marca todas las actividades antes de cerrar")
    visit.status = "completada"
    visit.ended_at = incoming
    visit.summary = body.summary.strip()
    if visit.assignment:
        visit.assignment.status = "completada"
    db.commit()
    return visit_out(load_visit(db, visit_id))


@app.patch("/api/visits/{visit_id}")
def update_visit(
    visit_id: int,
    body: VisitUpdate,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    if user.role == "supervisor" and visit.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="Solo puedes editar tus visitas")
    if body.summary is None and body.location_note is None:
        raise HTTPException(status_code=400, detail="No hay cambios para guardar")
    if body.summary is not None:
        visit.summary = body.summary.strip()
    if body.location_note is not None:
        visit.location_note = body.location_note.strip()
    db.commit()
    return visit_out(load_visit(db, visit_id))


@app.patch("/api/visits/{visit_id}/photos/{photo_id}")
def update_photo(
    visit_id: int,
    photo_id: int,
    body: PhotoUpdate,
    user: User = Depends(require_supervisor),
    db: DbSession = Depends(get_db),
):
    visit = load_visit(db, visit_id)
    can_see(user, visit)
    photo = next((item for item in visit.photos if item.id == photo_id), None)
    if not photo:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    photo.caption = body.caption.strip()
    db.commit()
    return visit_out(load_visit(db, visit_id))


def load_novedad(db: DbSession, novedad_id: int) -> Novedad:
    item = (
        db.query(Novedad)
        .options(
            selectinload(Novedad.cost_center),
            selectinload(Novedad.supervisor),
            selectinload(Novedad.followups).selectinload(NovedadFollowUp.author),
        )
        .filter(Novedad.id == novedad_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Novedad no encontrada")
    item.followups.sort(key=lambda row: row.created_at)
    return item


@app.get("/api/novedades")
def list_novedades(
    severity: str | None = None,
    status: str | None = None,
    supervisor_id: int | None = None,
    cost_center_id: int | None = None,
    start: str | None = None,
    end: str | None = None,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    if severity and severity not in {"baja", "media", "alta"}:
        raise HTTPException(status_code=400, detail="Prioridad no válida")
    if status and status not in {"pendiente", "en_revision", "resuelta"}:
        raise HTTPException(status_code=400, detail="Estado no válido")
    start_day = parse_day(start)
    end_day = parse_day(end)
    if start_day and end_day and end_day.date() < start_day.date():
        raise HTTPException(status_code=400, detail="La fecha final no puede ser anterior a la inicial")
    query = db.query(Novedad).options(selectinload(Novedad.cost_center), selectinload(Novedad.supervisor))
    if user.role == "supervisor":
        query = query.filter(Novedad.supervisor_id == user.id)
    elif supervisor_id:
        query = query.filter(Novedad.supervisor_id == supervisor_id)
    if severity:
        query = query.filter(Novedad.severity == severity)
    if status:
        query = query.filter(Novedad.status == status)
    if cost_center_id:
        query = query.filter(Novedad.cost_center_id == cost_center_id)
    rows = query.order_by(Novedad.created_at.desc()).all()
    if start_day:
        rows = [item for item in rows if item.created_at.date() >= start_day.date()]
    if end_day:
        rows = [item for item in rows if item.created_at.date() <= end_day.date()]
    return [novedad_out(item) for item in rows]


@app.get("/api/novedades/alertas")
def novedad_alerts(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    query = db.query(Novedad).options(selectinload(Novedad.cost_center), selectinload(Novedad.supervisor))
    query = query.filter(Novedad.severity == "alta")
    if user.role == "supervisor":
        query = query.filter(Novedad.supervisor_id == user.id)
    rows = [item for item in query.order_by(Novedad.created_at.desc()).all() if novedad_open(item.status)]
    return [
        {
            "id": item.id,
            "title": item.title,
            "status": item.status,
            "created_at": item.created_at.isoformat(),
            "cost_center": item.cost_center.name,
            "supervisor": item.supervisor.name,
        }
        for item in rows
    ]


@app.patch("/api/novedades/{novedad_id}")
def update_novedad(
    novedad_id: int,
    body: NovedadStatusIn,
    user: User = Depends(require_coordinator),
    db: DbSession = Depends(get_db),
):
    item = load_novedad(db, novedad_id)
    if body.status is None and body.title is None and body.description is None and body.severity is None:
        raise HTTPException(status_code=400, detail="No hay cambios para guardar")
    if body.status is not None and body.status != item.status:
        item.status = body.status
        db.add(
            NovedadFollowUp(
                novedad_id=item.id,
                user_id=user.id,
                kind="estado",
                body=f"Estado cambiado a {STATUS_LABELS[body.status]}",
                status=body.status,
                created_at=now(),
            )
        )
    if body.title is not None:
        item.title = body.title.strip()
    if body.description is not None:
        item.description = body.description.strip()
    if body.severity is not None:
        item.severity = body.severity
    db.commit()
    return novedad_out(load_novedad(db, novedad_id))


@app.post("/api/novedades/{novedad_id}/seguimiento")
def add_followup(
    novedad_id: int,
    body: FollowUpIn,
    user: User = Depends(require_coordinator),
    db: DbSession = Depends(get_db),
):
    item = load_novedad(db, novedad_id)
    db.add(
        NovedadFollowUp(
            novedad_id=item.id,
            user_id=user.id,
            kind=body.kind,
            body=body.body.strip(),
            status=None,
            created_at=now(),
        )
    )
    db.commit()
    return novedad_out(load_novedad(db, novedad_id))


def supervisor_stats(users: list[User], visits: list[Visit], novedades: list[Novedad]) -> list[dict]:
    rows = []
    for person in users:
        own = [visit for visit in visits if visit.supervisor_id == person.id]
        last = max(own, key=lambda visit: visit.started_at) if own else None
        rows.append(
            {
                **user_out(person),
                "visits": len(own),
                "open_novedades": sum(
                    1 for item in novedades if item.supervisor_id == person.id and novedad_open(item.status)
                ),
                "last_visit_at": last.started_at.isoformat() if last else None,
            }
        )
    return rows


@app.get("/api/supervisors")
def list_supervisors(_: User = Depends(current_user), db: DbSession = Depends(get_db)):
    people = db.query(User).filter(User.role == "supervisor").order_by(User.name).all()
    visits = db.query(Visit).all()
    novedades = db.query(Novedad).all()
    return supervisor_stats(people, visits, novedades)


@app.post("/api/supervisors")
def create_supervisor(body: SupervisorIn, _: User = Depends(require_coordinator), db: DbSession = Depends(get_db)):
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")
    person = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password), role="supervisor")
    db.add(person)
    db.commit()
    db.refresh(person)
    return {**user_out(person), "visits": 0, "open_novedades": 0, "last_visit_at": None}


@app.post("/api/cost-centers")
def create_center(body: CenterIn, _: User = Depends(require_coordinator), db: DbSession = Depends(get_db)):
    center = CostCenter(
        name=body.name.strip(),
        client=body.client.strip(),
        address=body.address.strip(),
        city=body.city.strip(),
        lat=body.lat,
        lng=body.lng,
        radius_m=body.radius_m,
    )
    db.add(center)
    db.commit()
    db.refresh(center)
    return center_out(center)


@app.get("/api/cost-centers/{center_id}")
def get_center(center_id: int, _: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return center_out(take_center(db, center_id))


@app.patch("/api/cost-centers/{center_id}")
def update_center(
    center_id: int,
    body: CenterUpdate,
    _: User = Depends(require_coordinator),
    db: DbSession = Depends(get_db),
):
    center = take_center(db, center_id)
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No hay cambios para guardar")
    for field, value in changes.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(center, field, value)
    db.commit()
    db.refresh(center)
    return center_out(center)


@app.get("/api/supervisors/{supervisor_id}")
def get_supervisor(supervisor_id: int, _: User = Depends(current_user), db: DbSession = Depends(get_db)):
    person = take_supervisor(db, supervisor_id)
    visits = db.query(Visit).filter(Visit.supervisor_id == person.id).all()
    novedades = db.query(Novedad).filter(Novedad.supervisor_id == person.id).all()
    return supervisor_stats([person], visits, novedades)[0]


@app.patch("/api/supervisors/{supervisor_id}")
def update_supervisor(
    supervisor_id: int,
    body: SupervisorUpdate,
    _: User = Depends(require_coordinator),
    db: DbSession = Depends(get_db),
):
    person = take_supervisor(db, supervisor_id)
    if body.name is not None:
        person.name = body.name.strip()
    if body.email is not None:
        email = body.email.strip().lower()
        taken = db.query(User).filter(User.email == email, User.id != person.id).first()
        if taken:
            raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo")
        person.email = email
    if body.password is not None:
        person.password_hash = hash_password(body.password)
    if body.name is None and body.email is None and body.password is None:
        raise HTTPException(status_code=400, detail="No hay cambios para guardar")
    db.commit()
    db.refresh(person)
    visits = db.query(Visit).filter(Visit.supervisor_id == person.id).all()
    novedades = db.query(Novedad).filter(Novedad.supervisor_id == person.id).all()
    return supervisor_stats([person], visits, novedades)[0]


@app.get("/api/users")
def list_users(_: User = Depends(require_coordinator), db: DbSession = Depends(get_db)):
    people = db.query(User).order_by(User.name).all()
    return [user_out(person) for person in people]


@app.get("/api/assignments")
def list_assignments(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    query = db.query(Assignment).options(
        selectinload(Assignment.cost_center),
        selectinload(Assignment.supervisor),
        selectinload(Assignment.visit),
    )
    if user.role == "supervisor":
        query = query.filter(Assignment.supervisor_id == user.id)
    rows = query.order_by(Assignment.scheduled_for).all()
    return [assignment_out(item) for item in rows]


@app.get("/api/assignments/{assignment_id}")
def get_assignment(assignment_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    item = load_assignment(db, assignment_id)
    if user.role == "supervisor" and item.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No puedes ver esta asignación")
    return assignment_out(item)


@app.post("/api/assignments")
def create_assignment(body: AssignmentIn, _: User = Depends(require_coordinator), db: DbSession = Depends(get_db)):
    person = take_supervisor(db, body.supervisor_id)
    center = take_center(db, body.cost_center_id)
    duplicate = (
        db.query(Assignment)
        .filter(
            Assignment.supervisor_id == person.id,
            Assignment.cost_center_id == center.id,
            Assignment.status == "pendiente",
            Assignment.scheduled_for == body.scheduled_for,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Ya existe una asignación pendiente para esa fecha")
    item = Assignment(
        supervisor_id=person.id,
        cost_center_id=center.id,
        scheduled_for=body.scheduled_for,
        status="pendiente",
        notes=body.notes.strip(),
        created_at=now(),
    )
    db.add(item)
    db.commit()
    return assignment_out(load_assignment(db, item.id))


@app.patch("/api/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    body: AssignmentUpdate,
    _: User = Depends(require_coordinator),
    db: DbSession = Depends(get_db),
):
    item = load_assignment(db, assignment_id)
    if body.supervisor_id is not None:
        if item.visit and item.visit.status == "en_curso":
            raise HTTPException(status_code=400, detail="No puedes cambiar el supervisor con la visita en curso")
        item.supervisor_id = take_supervisor(db, body.supervisor_id).id
    if body.cost_center_id is not None:
        if item.visit:
            raise HTTPException(status_code=400, detail="No puedes cambiar el centro si la visita ya empezó")
        item.cost_center_id = take_center(db, body.cost_center_id).id
    if body.scheduled_for is not None:
        item.scheduled_for = body.scheduled_for
    if body.notes is not None:
        item.notes = body.notes.strip()
    if body.status is not None:
        if body.status == "cancelada" and item.visit and item.visit.status == "en_curso":
            raise HTTPException(status_code=400, detail="No puedes cancelar una visita que sigue en curso")
        item.status = body.status
    if not body.model_dump(exclude_unset=True):
        raise HTTPException(status_code=400, detail="No hay cambios para guardar")
    db.commit()
    return assignment_out(load_assignment(db, item.id))


@app.get("/api/novedades/{novedad_id}")
def get_novedad(novedad_id: int, user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    item = load_novedad(db, novedad_id)
    if user.role == "supervisor" and item.supervisor_id != user.id:
        raise HTTPException(status_code=403, detail="No puedes ver esta novedad")
    return novedad_out(item)


@app.get("/api/reports")
def reports(
    start: str | None = None,
    end: str | None = None,
    user: User = Depends(current_user),
    db: DbSession = Depends(get_db),
):
    today = now().date()
    try:
        start_day = datetime.strptime(start, "%Y-%m-%d").date() if start else today - timedelta(days=6)
        end_day = datetime.strptime(end, "%Y-%m-%d").date() if end else today
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Usa fechas con formato AAAA-MM-DD") from error
    if end_day < start_day:
        raise HTTPException(status_code=400, detail="La fecha final no puede ser anterior a la inicial")

    visits = (
        db.query(Visit)
        .options(
            selectinload(Visit.cost_center),
            selectinload(Visit.supervisor),
            selectinload(Visit.novedades),
            selectinload(Visit.checks),
        )
        .order_by(Visit.started_at.desc())
        .all()
    )
    novedades = db.query(Novedad).options(selectinload(Novedad.supervisor), selectinload(Novedad.cost_center)).all()
    if user.role == "supervisor":
        visits = [visit for visit in visits if visit.supervisor_id == user.id]
        novedades = [item for item in novedades if item.supervisor_id == user.id]

    in_range = [visit for visit in visits if start_day <= visit.started_at.date() <= end_day]
    range_ids = {visit.id for visit in in_range}
    range_novedades = [item for item in novedades if item.visit_id in range_ids or (item.visit_id is None and start_day <= item.created_at.date() <= end_day)]
    completed = [visit for visit in in_range if visit.status == "completada"]
    located = [visit for visit in completed if visit.location_valid]
    people = db.query(User).filter(User.role == "supervisor").order_by(User.name).all()
    if user.role == "supervisor":
        people = [person for person in people if person.id == user.id]

    reviewed = [check for visit in in_range for check in visit.checks if check.result in {"cumple", "incumple"}]
    fulfilled = [check for check in reviewed if check.result == "cumple"]
    by_supervisor = supervisor_stats(people, in_range, range_novedades)
    for row in by_supervisor:
        own_checks = [
            check
            for visit in in_range
            if visit.supervisor_id == row["id"]
            for check in visit.checks
            if check.result in {"cumple", "incumple"}
        ]
        own_ok = sum(1 for check in own_checks if check.result == "cumple")
        row["checks"] = len(own_checks)
        row["checks_cumple"] = own_ok
        row["compliance_rate"] = round(own_ok / len(own_checks), 2) if own_checks else 0

    return {
        "start": start_day.isoformat(),
        "end": end_day.isoformat(),
        "visits": len(in_range),
        "open_novedades": sum(1 for item in range_novedades if novedad_open(item.status)),
        "location_ok_rate": round(len(located) / len(completed), 2) if completed else 0,
        "compliance_rate": round(len(fulfilled) / len(reviewed), 2) if reviewed else 0,
        "checks_cumple": len(fulfilled),
        "checks_incumple": len(reviewed) - len(fulfilled),
        "by_supervisor": by_supervisor,
        "rows": [
            {
                "id": visit.id,
                "started_at": visit.started_at.isoformat(),
                "status": visit.status,
                "location_valid": visit.location_valid,
                "distance_m": visit.distance_m,
                "center": visit.cost_center.name,
                "supervisor": visit.supervisor.name,
                "novedades": len(visit.novedades),
                "cumple": sum(1 for check in visit.checks if check.result == "cumple"),
                "incumple": sum(1 for check in visit.checks if check.result == "incumple"),
            }
            for visit in in_range
        ],
        "novedades": [
            {
                "id": item.id,
                "created_at": item.created_at.isoformat(),
                "title": item.title,
                "description": item.description,
                "severity": item.severity,
                "status": item.status,
                "center": item.cost_center.name if item.cost_center else "",
                "supervisor": item.supervisor.name,
            }
            for item in range_novedades
        ],
    }


@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    visits = (
        db.query(Visit)
        .options(
            selectinload(Visit.cost_center),
            selectinload(Visit.assignment),
            selectinload(Visit.supervisor),
            selectinload(Visit.checks).selectinload(VisitCheck.activity),
            selectinload(Visit.photos),
            selectinload(Visit.novedades).selectinload(Novedad.cost_center),
            selectinload(Visit.novedades).selectinload(Novedad.supervisor),
        )
        .order_by(Visit.started_at.desc())
        .all()
    )
    novedades = (
        db.query(Novedad)
        .options(selectinload(Novedad.cost_center), selectinload(Novedad.supervisor))
        .order_by(Novedad.created_at.desc())
        .all()
    )
    if user.role == "supervisor":
        visits = [visit for visit in visits if visit.supervisor_id == user.id]
        novedades = [item for item in novedades if item.supervisor_id == user.id]
    today = now().date()
    week_start = today.toordinal() - 6
    completed = [visit for visit in visits if visit.status == "completada"]
    located = [visit for visit in completed if visit.location_valid]
    centers = db.query(CostCenter).order_by(CostCenter.name).all()
    by_center = []
    for center in centers:
        center_visits = [visit for visit in visits if visit.cost_center_id == center.id]
        last = center_visits[0] if center_visits else None
        by_center.append(
            {
                "cost_center": center_out(center),
                "visits": len(center_visits),
                "last_visit_at": last.started_at.isoformat() if last else None,
                "open_novedades": sum(
                    1
                    for item in novedades
                    if item.cost_center_id == center.id and novedad_open(item.status)
                ),
            }
        )

    return {
        "visits_today": sum(1 for visit in visits if visit.started_at.date() == today),
        "visits_week": sum(1 for visit in visits if visit.started_at.date().toordinal() >= week_start),
        "open_novedades": sum(1 for item in novedades if novedad_open(item.status)),
        "active_visits": sum(1 for visit in visits if visit.status == "en_curso"),
        "location_ok_rate": round(len(located) / len(completed), 2) if completed else 0,
        "cost_centers": len(centers),
        "supervisors": db.query(User).filter(User.role == "supervisor").count(),
        "recent_visits": [visit_out(visit) for visit in visits[:8]],
        "novedades": [novedad_out(item) for item in novedades[:6]],
        "by_center": by_center,
    }
