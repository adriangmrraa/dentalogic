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

### Sincronización Manual GCal
`POST /admin/sync/calendar`

**DEPRECATED (v2.0)**: La sincronización ahora es automática (JIT). Este endpoint fuerza una actualización masiva pero no es necesario para la operación normal.

## Pacientes

### Alta de Paciente
`POST /admin/patients`

Crea una ficha médica administrativamente.

**Payload:**
```json
{
  "first_name": "Juan",
  "last_name": "Perez",
  "dni": "12345678",
  "phone_number": "+54911...",
  "insurance_provider": "OSDE"
}
```
