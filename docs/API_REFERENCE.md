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
  "insurance_provider": "OSDE",
  "urgency_level": "medium"
}
```

### Contexto Clínico del Paciente
`GET /admin/patients/phone/{phone}/context`

Retorna información consolidada para la vista de chat (Última cita, próxima cita, plan de tratamiento). Aislado por `tenant_id`.

**Response:**
```json
{
  "patient": { "id": 1, "first_name": "Juan", ... },
  "last_appointment": {
    "date": "2026-02-01T10:00:00",
    "type": "Limpieza",
    "duration_minutes": 30,
    "professional_name": "Dr. Smith"
  },
  "upcoming_appointment": {
    "date": "2026-02-15T15:00:00",
    "type": "Control",
    "duration_minutes": 20,
    "professional_name": "Dra. Gomez"
  },
  "treatment_plan": "Blanqueamiento dental en 3 sesiones",
  "is_guest": false
}
```

## Analítica y Estadísticas

### Resumen de Estadísticas
`GET /admin/stats/summary`

Retorna métricas clave del sistema (IA, Ingresos, Urgencias).

**Query Params:**
- `range`: Período de tiempo (`weekly` para 7 días, `monthly` para 30 días). Default: `weekly`.

**Response:**
```json
{
  "ia_conversations": 150,
  "ia_appointments": 12,
  "active_urgencies": 3,
  "total_revenue": 45000.0,
  "growth_data": [
    { "date": "2026-02-01", "ia_referrals": 5, "completed_appointments": 3 }
  ]
}
```

### Urgencias Recientes
`GET /admin/chat/urgencies`

Lista los últimos casos de urgencia detectados por el sistema de triaje IA.

**Response:**
```json
[
  {
    "id": "123",
    "patient_name": "Juan Perez",
    "phone": "+54911...",
    "urgency_level": "CRITICAL",
    "reason": "Dolor agudo...",
    "timestamp": "2026-02-08T10:30:00"
  }
]
```

## Parámetros Globales (Paginación)
Todas las rutas administrativas soportan:
- `limit`: Cantidad de registros (default: 50).
- `offset`: Desplazamiento.
- `search`: Filtro por texto libre.
