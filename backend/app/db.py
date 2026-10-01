import hashlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

BOGOTA = ZoneInfo("America/Bogota")
DB_PATH = "supervision.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(32))

    visits: Mapped[list["Visit"]] = relationship(back_populates="supervisor")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="supervisor")


class Session(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()


class CostCenter(Base):
    __tablename__ = "cost_centers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    client: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(String(240))
    city: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    radius_m: Mapped[int] = mapped_column(Integer, default=200)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supervisor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    cost_center_id: Mapped[int] = mapped_column(ForeignKey("cost_centers.id"))
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="pendiente")
    notes: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    supervisor: Mapped[User] = relationship(back_populates="assignments")
    cost_center: Mapped[CostCenter] = relationship()
    visit: Mapped["Visit | None"] = relationship(back_populates="assignment", uselist=False)


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cost_center_id: Mapped[int] = mapped_column(ForeignKey("cost_centers.id"))
    supervisor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(32), default="en_curso")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    check_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    location_note: Mapped[str] = mapped_column(String(240), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id"), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    cost_center: Mapped[CostCenter] = relationship()
    assignment: Mapped[Assignment | None] = relationship(back_populates="visit")
    supervisor: Mapped[User] = relationship(back_populates="visits")
    checks: Mapped[list["VisitCheck"]] = relationship(back_populates="visit", cascade="all, delete-orphan")
    photos: Mapped[list["Photo"]] = relationship(back_populates="visit", cascade="all, delete-orphan")
    novedades: Mapped[list["Novedad"]] = relationship(back_populates="visit", cascade="all, delete-orphan")


class VisitCheck(Base):
    __tablename__ = "visit_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"))
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"))
    result: Mapped[str] = mapped_column(String(32), default="pendiente")
    notes: Mapped[str] = mapped_column(String(400), default="")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    visit: Mapped[Visit] = relationship(back_populates="checks")
    activity: Mapped[Activity] = relationship()


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"))
    filename: Mapped[str] = mapped_column(String(200))
    caption: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    visit: Mapped[Visit] = relationship(back_populates="photos")


class Novedad(Base):
    __tablename__ = "novedades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), nullable=True)
    cost_center_id: Mapped[int] = mapped_column(ForeignKey("cost_centers.id"))
    supervisor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(32), default="media")
    status: Mapped[str] = mapped_column(String(32), default="pendiente")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    visit: Mapped[Visit | None] = relationship(back_populates="novedades")
    cost_center: Mapped[CostCenter] = relationship()
    supervisor: Mapped[User] = relationship()
    followups: Mapped[list["NovedadFollowUp"]] = relationship(back_populates="novedad", cascade="all, delete-orphan")


class NovedadFollowUp(Base):
    __tablename__ = "novedad_followups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    novedad_id: Mapped[int] = mapped_column(ForeignKey("novedades.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(32))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    novedad: Mapped[Novedad] = relationship(back_populates="followups")
    author: Mapped[User] = relationship()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def now() -> datetime:
    return datetime.now(BOGOTA)


def ensure_schema() -> None:
    with engine.begin() as connection:
        tables = {row[0] for row in connection.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "visits" not in tables:
            return
        additions = {
            "visits": {
                "assignment_id": "INTEGER",
                "client_id": "VARCHAR(64)",
            },
            "visit_checks": {"updated_at": "DATETIME"},
            "photos": {"client_id": "VARCHAR(64)"},
            "novedades": {"client_id": "VARCHAR(64)"},
        }
        for table, columns in additions.items():
            if table not in tables:
                continue
            present = {row[1] for row in connection.execute(text(f"PRAGMA table_info({table})"))}
            for name, ddl in columns.items():
                if name not in present:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
        for table in ("visits", "photos", "novedades"):
            connection.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_client_id "
                    f"ON {table}(client_id) WHERE client_id IS NOT NULL"
                )
            )
        if "novedades" in tables:
            connection.execute(text("UPDATE novedades SET status = 'pendiente' WHERE status = 'abierta'"))
            connection.execute(text("UPDATE novedades SET status = 'en_revision' WHERE status = 'en_seguimiento'"))
            connection.execute(text("UPDATE novedades SET status = 'resuelta' WHERE status = 'cerrada'"))


def ensure_followups() -> None:
    db = SessionLocal()
    try:
        for item in db.query(Novedad).all():
            exists = db.query(NovedadFollowUp).filter(NovedadFollowUp.novedad_id == item.id).first()
            if exists:
                continue
            db.add(
                NovedadFollowUp(
                    novedad_id=item.id,
                    user_id=item.supervisor_id,
                    kind="estado",
                    body="Novedad registrada",
                    status=item.status,
                    created_at=item.created_at,
                )
            )
        db.commit()
    finally:
        db.close()


def seed() -> None:
    db = SessionLocal()
    try:
        if db.query(User).first():
            return

        supervisor = User(
            name="Laura Méndez",
            email="supervisor@aseo.com",
            password_hash=hash_password("demo"),
            role="supervisor",
        )
        coordinator = User(
            name="Carlos Ríos",
            email="coordinador@aseo.com",
            password_hash=hash_password("demo"),
            role="coordinador",
        )
        db.add_all([supervisor, coordinator])
        db.flush()

        centers = [
            CostCenter(
                name="Torre Andina",
                client="Andina Offices",
                address="Calle 72 #10-20",
                city="Bogotá",
                lat=4.6564,
                lng=-74.0562,
                radius_m=200,
            ),
            CostCenter(
                name="Clínica del Norte",
                client="Salud Norte",
                address="Carrera 15 #100-20",
                city="Bogotá",
                lat=4.6862,
                lng=-74.0481,
                radius_m=180,
            ),
            CostCenter(
                name="Plaza Mayor",
                client="Inmobiliaria Plaza",
                address="Avenida 68 #40-10",
                city="Bogotá",
                lat=4.6288,
                lng=-74.1024,
                radius_m=250,
            ),
            CostCenter(
                name="Universidad Central",
                client="Fundación Central",
                address="Carrera 7 #40-62",
                city="Bogotá",
                lat=4.6295,
                lng=-74.0654,
                radius_m=220,
            ),
            CostCenter(
                name="Edificio Bancario",
                client="Banco del Centro",
                address="Calle 26 #68-50",
                city="Bogotá",
                lat=4.6548,
                lng=-74.1096,
                radius_m=150,
            ),
            CostCenter(
                name="Conjunto Cedros",
                client="PH Cedros",
                address="Carrera 50 #140-20",
                city="Bogotá",
                lat=4.7221,
                lng=-74.0558,
                radius_m=200,
            ),
        ]
        db.add_all(centers)

        activities = [
            Activity(name="Pisos y superficies", description="Barrido, trapeado y brillo de áreas asignadas.", sort_order=1),
            Activity(name="Baños y lavamanos", description="Sanitización, papel, jabón y olores.", sort_order=2),
            Activity(name="Residuos", description="Recolección, bolsas y puntos ecológicos.", sort_order=3),
            Activity(name="Zonas comunes", description="Pasillos, recepción, ascensores y escaleras.", sort_order=4),
            Activity(name="Insumos y dotación", description="Existencias mínimas y estado de equipos.", sort_order=5),
            Activity(name="Cierre del sitio", description="Puertas, alarmas y entrega al contacto del cliente.", sort_order=6),
        ]
        db.add_all(activities)
        db.flush()

        moment = now()
        samples = [
            (0, 0, True, 42, "cumple", None),
            (1, 1, True, 88, "cumple", ("Falta de jabón", "El dispensador del baño del segundo piso está vacío.", "media")),
            (2, 0, False, 640, "cumple", ("Acceso restringido", "El supervisor no pudo ingresar al sótano por llave dañada.", "alta")),
            (3, 2, True, 31, "no_aplica", None),
            (4, 1, True, 110, "cumple", ("Piso húmedo", "Se dejó aviso de piso húmedo en el lobby después del trapeado.", "baja")),
        ]

        for offset_days, center_idx, valid, distance, check_result, novedad in samples:
            started = moment - timedelta(days=offset_days, hours=3)
            visit = Visit(
                cost_center_id=centers[center_idx].id,
                supervisor_id=supervisor.id,
                status="completada",
                started_at=started,
                ended_at=started + timedelta(minutes=48),
                check_lat=centers[center_idx].lat,
                check_lng=centers[center_idx].lng,
                distance_m=distance,
                location_valid=valid,
                location_note="" if valid else "Registro fuera del radio permitido.",
                summary="Visita de supervisión de rutina.",
            )
            db.add(visit)
            db.flush()
            for activity in activities:
                result = check_result if activity.sort_order == 2 and check_result == "no_aplica" else "cumple"
                db.add(
                    VisitCheck(
                        visit_id=visit.id,
                        activity_id=activity.id,
                        result=result,
                        notes="",
                    )
                )
            if novedad:
                title, description, severity = novedad
                db.add(
                    Novedad(
                        visit_id=visit.id,
                        cost_center_id=centers[center_idx].id,
                        supervisor_id=supervisor.id,
                        title=title,
                        description=description,
                        severity=severity,
                        status="abierta" if severity != "baja" else "cerrada",
                        created_at=started + timedelta(minutes=20),
                    )
                )

        db.commit()
    finally:
        db.close()


def ensure_team() -> None:
    db = SessionLocal()
    try:
        for name, email in (
            ("Andrés Peña", "andres@aseo.com"),
            ("Marta Solano", "marta@aseo.com"),
            ("Julián Castro", "julian@aseo.com"),
        ):
            if not db.query(User).filter(User.email == email).first():
                db.add(
                    User(
                        name=name,
                        email=email,
                        password_hash=hash_password("demo"),
                        role="supervisor",
                    )
                )
        db.flush()
        if db.query(Visit).filter(Visit.location_note == "Ejemplo de equipo").first():
            db.commit()
            return

        centers = {center.name: center for center in db.query(CostCenter).all()}
        activities = db.query(Activity).order_by(Activity.sort_order).all()
        people = {user.email: user for user in db.query(User).filter(User.role == "supervisor").all()}
        moment = now()
        samples = [
            ("andres@aseo.com", "Universidad Central", 1, True, 55, None),
            (
                "andres@aseo.com",
                "Edificio Bancario",
                5,
                False,
                480,
                ("Portería cerrada", "No había contacto en recepción a la hora de la visita.", "alta"),
            ),
            (
                "marta@aseo.com",
                "Conjunto Cedros",
                2,
                True,
                70,
                ("Bolsa rota", "El punto ecológico del lobby tenía una bolsa rota.", "baja"),
            ),
            ("julian@aseo.com", "Plaza Mayor", 0, True, 24, None),
        ]
        for email, center_name, days, valid, distance, novedad in samples:
            center = centers.get(center_name)
            person = people.get(email)
            if not center or not person:
                continue
            started = moment - timedelta(days=days, hours=2)
            visit = Visit(
                cost_center_id=center.id,
                supervisor_id=person.id,
                status="completada",
                started_at=started,
                ended_at=started + timedelta(minutes=40),
                check_lat=center.lat,
                check_lng=center.lng,
                distance_m=distance,
                location_valid=valid,
                location_note="Ejemplo de equipo",
                summary="Visita de ejemplo del equipo de supervisión.",
            )
            db.add(visit)
            db.flush()
            for activity in activities:
                db.add(VisitCheck(visit_id=visit.id, activity_id=activity.id, result="cumple"))
            if novedad:
                title, description, severity = novedad
                db.add(
                    Novedad(
                        visit_id=visit.id,
                        cost_center_id=center.id,
                        supervisor_id=person.id,
                        title=title,
                        description=description,
                        severity=severity,
                        status="abierta" if severity != "baja" else "cerrada",
                        created_at=started + timedelta(minutes=15),
                    )
                )
        db.commit()
    finally:
        db.close()


def ensure_assignments() -> None:
    db = SessionLocal()
    try:
        if db.query(Assignment).first():
            return
        people = {user.email: user for user in db.query(User).all()}
        centers = {center.name: center for center in db.query(CostCenter).all()}
        moment = now()
        planned = [
            ("supervisor@aseo.com", "Universidad Central", 1, "Ruta de la mañana: pisos y baños."),
            ("andres@aseo.com", "Clínica del Norte", 0, "Revisión de insumos y puntos ecológicos."),
            ("marta@aseo.com", "Edificio Bancario", 2, "Visita programada al lobby y sótanos."),
        ]
        for email, center_name, days, notes in planned:
            person = people.get(email)
            center = centers.get(center_name)
            if not person or not center:
                continue
            db.add(
                Assignment(
                    supervisor_id=person.id,
                    cost_center_id=center.id,
                    scheduled_for=moment + timedelta(days=days, hours=3),
                    status="pendiente",
                    notes=notes,
                    created_at=moment,
                )
            )
        db.commit()
    finally:
        db.close()


def ensure_demo_day() -> None:
    """Garantiza una ruta pendiente de hoy para la demostración, sin duplicarla."""
    db = SessionLocal()
    try:
        people = {user.email: user for user in db.query(User).filter(User.role == "supervisor").all()}
        centers = {center.name: center for center in db.query(CostCenter).all()}
        moment = now().replace(hour=14, minute=0, second=0, microsecond=0)
        routes = [
            (
                "supervisor@aseo.com",
                "Conjunto Cedros",
                "Ruta de demostración: baños, insumos y evidencia fotográfica.",
            ),
            (
                "andres@aseo.com",
                "Torre Andina",
                "Ruta de demostración: zonas comunes y puntos ecológicos.",
            ),
        ]
        for email, center_name, notes in routes:
            person = people.get(email)
            center = centers.get(center_name)
            if not person or not center:
                continue
            open_route = (
                db.query(Assignment)
                .filter(
                    Assignment.supervisor_id == person.id,
                    Assignment.status.in_(("pendiente", "en_curso")),
                )
                .first()
            )
            if open_route:
                continue
            db.add(
                Assignment(
                    supervisor_id=person.id,
                    cost_center_id=center.id,
                    scheduled_for=moment,
                    status="pendiente",
                    notes=notes,
                    created_at=now(),
                )
            )
        db.commit()
    finally:
        db.close()
