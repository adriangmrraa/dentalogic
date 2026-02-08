# API Reference - Dentalogic Admin

## Autenticación
Todas las rutas administrativas requieren el header `X-Admin-Token`.

## Tratamientos (Services)

### Listar Tratamientos
`GET /admin/treatment-types`

Retorna todos los tipos de tratamiento configurados.

**Response:**
```json
[
  {
    "code": "limpieza_profunda",
    "name": "Limpieza Profunda",
    "duration_minutes": 60,
    "price": 5000,
    "is_active": true
  }
]
```

### Crear Tratamiento
`POST /admin/treatment-types`

Registra un nuevo servicio clínico.

**Payload:**
```json
{
  "code": "blanqueamiento",
  "name": "Blanqueamiento Dental",
  "description": "Tratamiento estético con láser",
  "default_duration_minutes": 45,
  "min_duration_minutes": 30,
  "max_duration_minutes": 60,
  "complexity_level": "medium",
  "category": "estetica",
  "requires_multiple_sessions": false,
  "session_gap_days": 0
}
```

### Actualizar Tratamiento
`PUT /admin/treatment-types/{code}`

Modifica las propiedades de un tratamiento existente.

**Payload:** (Mismo que POST, todos los campos opcionales)

### Eliminar Tratamiento
`DELETE /admin/treatment-types/{code}`

- Si no tiene citas asociadas: **Eliminación física**.
- Si tiene citas asociadas: **Soft Delete** (`is_active = false`).

## Profesionales

### Listar Profesionales
`GET /admin/professionals`

**Response:**
```json
[
  {
    "id": 1,
    "name": "Dr. Smith",
    "specialty": "Ortodoncia",
    "is_active": true,
    "working_hours": {
      "monday": { "enabled": true, "slots": [{ "start": "09:00", "end": "18:00" }] },
      "sunday": { "enabled": false, "slots": [] }
    }
  }
]
```

### Crear/Actualizar Profesional
`POST /admin/professionals` | `PUT /admin/professionals/{id}`

Permite gestionar el staff y su disponibilidad horaria (JSONB).

### Sincronización Automática JIT
`POST /admin/calendar/sync`

Fuerza el mirroring entre Google Calendar y la base de datos local.
- **Lógica**: Identifica bloqueos externos y los persiste como `google_calendar_blocks`.
- **Automatización**: Invocado silenciosamente al montar la Agenda en el frontend.

### Bóveda de Credenciales (Internal)
`POST /admin/internal/credentials`
Almacena tokens de OAuth para cada tenant de forma segura.

## Pacientes

### Alta de Paciente
`POST /admin/patients`

Crea una ficha médica administrativamente. Incluye triaje inicial.

**Payload:**
```json
{
  "first_name": "Juan",
  "last_name": "Perez",
  "dni": "12345678",
  "phone_number": "+54911...",
  "insurance_provider": "OSDE",
  "urgency_level": "medium"
}
```

## Parámetros Globales (Paginación)
Todos los endpoints `GET` que retornan listas de recursos soportan:
- `limit`: Cantidad de registros (default: 50).
- `offset`: Desplazamiento para paginación incremental.
- `search`: Filtro por texto (nombre, DNI, etc).
