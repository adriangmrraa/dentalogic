---
name: "Sovereign Backend Engineer"
description: "Experto en FastAPI y gestión segura de credenciales multi-tenant para Dentalogic."
trigger: "python, backend, endpoints, base de datos, credenciales, agents, tools"
scope: "BACKEND"
auto-invoke: true
---

# Sovereign Backend Engineer - Dentalogic

# Sovereign Backend Engineer - Dentalogic

## 1. Arquitectura y Estructura (Flat Pattern)
El proyecto utiliza una estructura plana en `orchestrator_service/` para máxima agilidad:
- `main.py`: Punto de entrada, agents y tools (Dental Tools).
- `admin_routes.py`: Endpoints administrativos (Pacientes, Profesionales, Dashboard).
- `gcal_service.py`: Gestión real con Google Calendar (Service Account).
- `db.py`: Conexiones asíncronas vía `asyncpg`.

## 2. Integración con Google Calendar (Sovereign Sync)
**REGLA DE ORO**: Toda cita creada en la plataforma o por la IA **DEBE** sincronizarse con Google Calendar.

### Sincronización en Tools (main.py):
```python
# gcal_service.create_event devuelve el event_id de Google
gcal_event = gcal_service.create_event(
    summary=f"Cita Dental: {patient_name}",
    start_time=start_iso,
    end_time=end_iso,
    description=f"Paciente: {phone}\nMotivo: {reason}"
)

# Persistir en la base de datos
await db.pool.execute(
    "UPDATE appointments SET google_calendar_event_id = $1, google_calendar_sync_status = 'synced' WHERE id = $2",
    gcal_event['id'], apt_id
)
```

## 3. Seguridad y Autenticación (Admin Protocol)
El acceso a endpoints administrativos está protegido por un `ADMIN_TOKEN`:

### Header Requerido:
`X-Admin-Token: <tu-token-aqui>`

### Validación en FastAPI:
```python
def verify_admin_token(x_admin_token: str = Header(...)):
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")
```

## 4. Patrones de Base de Datos (SQL Puro / asyncpg)
No usamos ORM pesado. Preferimos queries directas para mayor performance:

```python
# Ejemplo de fetch de pacientes
patients = await db.pool.fetch("""
    SELECT id, first_name, last_name, phone_number 
    FROM patients 
    WHERE status = 'active'
""")
```

### 4.1 Patrón de Subquery para Sorting (Recency)
Cuando se usa `DISTINCT ON`, el `ORDER BY` inicial debe coincidir. Para ordenar por otros campos (ej: fecha de mensaje), usar subquery:
```sql
SELECT * FROM (
    SELECT DISTINCT ON (phone_number) * 
    FROM sessions 
    ORDER BY phone_number, last_message_time DESC
) sub
ORDER BY last_message_time DESC;
```

## 5. Dental IA Tools (main.py)
Las herramientas de la IA deben seguir protocolos estrictos de triaje y agenda:
- `check_availability`: Siempre consulta GCal antes de proponer horarios.
- `book_appointment`: Valida datos del paciente antes de confirmar.
- `triage_urgency`: Clasifica el dolor y deriva a humano si es `critical`.

## 7. Normalización de Payloads (Compatibility Layer)
Para asegurar compatibilidad entre microservicios (especialmente WhatsApp -> Orquestador), los modelos Pydantic deben ser flexibles:
- **Regla**: Aceptar múltiples nombres para el mismo dato (ej: `phone` y `from_number`).
- **WhatsApp 24h Window**: Implementar chequeo de ventana en envíos manuales:
  - Validar que `last_user_msg_time` sea `< 24h`.
  - Retornar `403 Forbidden` si la ventana está cerrada.
- **Implementación**: Usar `@property` o `Field(alias=...)` en los modelos de request para normalizar el acceso a los datos.

```python
class ChatRequest(BaseModel):
    message: Optional[str] = None
    text: Optional[str] = None  # Alias para compatibilidad
    
    @property
    def final_message(self) -> str:
        return self.message or self.text or ""
```

## 8. Checklist de Desarrollo
- [ ] ¿El nuevo endpoint usa `verify_admin_token`?
- [ ] ¿Las operaciones de citas disparan un `gcal_service` sync?
- [ ] ¿Se emiten eventos vía Socket.IO para actualización del Dashboard?
- [ ] ¿El log de errores incluye contexto del paciente/turno?
