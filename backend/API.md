# API de Supervisión de Campo

Base: `http://127.0.0.1:8001`

La documentación interactiva queda en `/docs`. Todas las rutas, salvo el login y el health check, piden `Authorization: Bearer <token>`.

El frontend de React en `http://127.0.0.1:5173` está permitido por CORS.

## Autenticación

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/auth/login` | Correo y contraseña. Devuelve token y usuario. |
| GET | `/api/auth/me` | Usuario de la sesión. |

## Usuarios

Roles: `supervisor` y `coordinador`.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/users` | Lista usuarios. Solo coordinación. |
| GET | `/api/supervisors` | Supervisores con visitas y novedades abiertas. |
| GET | `/api/supervisors/{id}` | Un supervisor. |
| POST | `/api/supervisors` | Crea un supervisor. Solo coordinación. |
| PATCH | `/api/supervisors/{id}` | Edita nombre, correo o contraseña. |

## Centros de costo

Nombre, cliente, dirección, ciudad, coordenadas y radio de validación.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/cost-centers` | Lista. |
| GET | `/api/cost-centers/{id}` | Detalle. |
| POST | `/api/cost-centers` | Crea. Solo coordinación. |
| PATCH | `/api/cost-centers/{id}` | Edita. Solo coordinación. |

## Asignaciones

Programan una visita: supervisor, centro, fecha y hora, notas y estado (`pendiente`, `en_curso`, `completada`, `cancelada`).

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/assignments` | Lista. El supervisor solo ve las suyas. |
| GET | `/api/assignments/{id}` | Detalle. |
| POST | `/api/assignments` | Crea. Solo coordinación. |
| PATCH | `/api/assignments/{id}` | Edita fecha, notas, centro, supervisor o estado. |

## Visitas

Incluyen llegada (`started_at`), salida (`ended_at`), coordenadas, distancia, validez de la ubicación y estado (`en_curso`, `completada`).

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/visits` | Lista. |
| GET | `/api/visits/{id}` | Detalle con actividades, fotos y novedades. |
| POST | `/api/visits` | El supervisor inicia la visita y valida el GPS. Si hay una asignación pendiente del mismo centro, queda ligada. |
| PATCH | `/api/visits/{id}` | Edita observación o nota de ubicación. |
| POST | `/api/visits/{id}/close` | Cierra la visita cuando todas las actividades están marcadas. |

## Actividades

El catálogo se consulta en `GET /api/activities`. El cumplimiento de cada visita se guarda en la visita.

| Método | Ruta | Uso |
|---|---|---|
| PATCH | `/api/visits/{id}/checks/{check_id}` | `cumple`, `no_aplica` o `pendiente`, con observaciones. |

## Novedades

Descripción, prioridad (`baja`, `media`, `alta`) y estado (`abierta`, `en_seguimiento`, `cerrada`).

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/novedades` | Lista. |
| GET | `/api/novedades/{id}` | Detalle. |
| POST | `/api/visits/{id}/novedades` | El supervisor reporta una novedad durante la visita. |
| PATCH | `/api/novedades/{id}` | Coordinación actualiza estado, título, descripción o prioridad. |

## Evidencias

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/visits/{id}/photos` | Sube una imagen (`file`) y un texto (`caption`). |
| PATCH | `/api/visits/{id}/photos/{photo_id}` | Edita el texto de la evidencia. |

Los archivos se sirven en `/uploads/{archivo}`.

## Consultas de operación

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/dashboard` | Indicadores. El supervisor ve su propia operación. |
| GET | `/api/reports?start=AAAA-MM-DD&end=AAAA-MM-DD` | Visitas del periodo. |
| GET | `/api/health` | Comprueba que el servidor responde. |

Los errores de validación y de negocio responden con `{ "detail": "mensaje" }`.
