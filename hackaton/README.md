# Supervisión Inteligente de Servicios en Campo

FieldCheck registra visitas de supervisión de aseo en centros de costo: ubicación, actividades, fotografías y novedades. El coordinador consulta la operación. El supervisor trabaja en campo, también sin Internet.

## Requisitos

- Python 3.11 o superior
- Node.js 20 o superior
- npm

El puerto `8000` puede estar ocupado. Esta aplicación usa la API en el puerto `8001`.

## Instalación

Desde la raíz del repositorio:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend
npm install
```

## Ejecución

Terminal 1, API:

```bash
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Hay que arrancar uvicorn dentro de `backend`. La base SQLite es `backend/supervision.db`.

Terminal 2, interfaz:

```bash
cd frontend
npm run dev
```

Abre http://127.0.0.1:5173

La documentación de la API queda en http://127.0.0.1:8001/docs

La primera vez, el arranque crea centros, actividades, supervisores, visitas de ejemplo y asignaciones pendientes. Si Laura o Andrés no tienen una visita abierta, se agrega una ruta de hoy.

## Cuentas

Contraseña de todas: `demo`

| Rol | Correo | Nombre |
| --- | --- | --- |
| Coordinador | coordinador@aseo.com | Carlos Ríos |
| Supervisor | supervisor@aseo.com | Laura Méndez |
| Supervisor | andres@aseo.com | Andrés Peña |
| Supervisor | marta@aseo.com | Marta Solano |
| Supervisor | julian@aseo.com | Julián Castro |

En el login hay botones para entrar como coordinador o como Laura.

## Guion de demostración

1. Entra como `coordinador@aseo.com`. En el dashboard, la sección **Visitas programadas** muestra las rutas pendientes de hoy.
2. Cierra sesión y entra como `supervisor@aseo.com`. En **Mi jornada** aparece la próxima visita. Pulsa **Hacer check-in**.
3. Si el navegador no entrega GPS, usa **Usar ubicación del centro** y confirma el check-in.
4. Marca las actividades como cumple o incumple.
5. En **Evidencia**, adjunta una foto y registra una novedad con título, descripción y prioridad.
6. Cierra la visita en **Check-out**.
7. Para mostrar el modo sin conexión, abre las herramientas del navegador, pasa a **Offline**, repite el registro de otra visita pendiente y vuelve a **Online**. El aviso pasa de “Sin conexión” a la sincronización. La visita no se duplica.
8. Entra otra vez como coordinador. La visita y la novedad aparecen en el dashboard, en Novedades y en el detalle de la supervisión.

## Qué está implementado

Probado en esta máquina contra la API en `8001` y la interfaz en `5173`:

- Login con roles de coordinador y supervisor.
- Centros de costo, actividades y asignaciones.
- Check-in con coordenadas del centro cuando no hay GPS, actividades, novedad, foto y check-out.
- Conservación local en IndexedDB y sincronización al recuperar Internet, sin duplicar el mismo registro.
- Dashboard del coordinador con visitas programadas, indicadores, gráficas y novedades reales.
- Filtros de novedades y reportes, con exportación CSV.
- El supervisor solo consulta sus visitas.

El GPS del teléfono no se probó en el navegador de escritorio. El respaldo con la ubicación del centro sí.
