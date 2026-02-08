# Guía para Desarrolladores - Mantenimiento y Extensión

Este documento contiene tips técnicos para mantener, debugear y extender **Dentalogic**, la plataforma de gestión clínica dental.

## 1. Agregar una Nueva Herramienta (Tool)

### Paso 1: Definir la Función en main.py

Ubicación: `orchestrator_service/main.py`

```python
from langchain.tools import tool

@tool
async def mi_nueva_herramienta(parametro1: str, parametro2: int = 10):
    """
    Descripción clara de qué hace esta herramienta.
    """
    # Tu lógica aquí
    return {"resultado": "ok"}
```

### Paso 2: Agregar a la Lista de Tools

Busca la lista `tools` y agrega la referencia.

## 2. Paginación y Carga Incremental de Mensajes

Para optimizar el rendimiento en conversaciones extensas, Dentalogic utiliza un sistema de carga bajo demanda en `ChatsView.tsx`:
- **Backend (Admin API)**: Soporta parámetros `limit` (default 50) y `offset` para consultas SQL (`LIMIT $2 OFFSET $3`).
- **Frontend**: Utiliza el estado `messageOffset` para gestionar qué bloque de mensajes solicitar. Los nuevos mensajes se concatenan al principio del array `messages` preservando la cronología.

## 3. Deduplicación de Mensajes
 
Redis almacena los `message_id` por 2 minutos para evitar procesar dobles webhooks de WhatsApp.

## 4. Debugging 

- **Logs Locales**: `docker-compose logs -f`
- **Logs Producción**: Panel de EasyPanel → Logs.
- **Protocolo Omega**: Los links de activación se imprimen en los logs del orquestador si falla el SMTP.

## 10. Versioning y Migración (Maintenance Robot)

Si necesitas cambiar la base de datos:
1.  Agrega el cambio en `db/init/dentalogic_schema.sql` (Foundation).
2.  Agrega un parche en `orchestrator_service/db.py` (Evolution). Usa bloques `DO $$` para que sea idempotente.

**Ejemplo: Patch working_hours (Feb 2026)**
```python
# En orchestrator_service/db.py
patch_sql = """
    DO $$ 
    BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='professionals' AND column_name='working_hours') THEN
            ALTER TABLE professionals ADD COLUMN working_hours JSONB;
            -- Inicializar con default si es necesario
            UPDATE professionals SET working_hours = '{"1":{"enabled":true,"slots":[{"start":"08:00","end":"20:00"}]}}'::jsonb;
        END IF;
    END $$;
"""
```

## 12. Gestión de Usuarios y Seguridad (Auth Layer)

### 12.1 Ciclo de Vida del Usuario
1.  **Registro**: Crea un usuario `pending`.
2.  **Aprobación**: Un CEO activa la cuenta en `/aprobaciones`.
    -   Se vincula/crea un perfil en `professionals`.
3.  **Activación**: El usuario ya puede loguearse.

### 12.2 Omega Protocol Prime
En despliegues iniciales, el sistema auto-activa al primer `ceo` registrado para evitar bloqueos.

### 12.3 Headers de Seguridad
-   `Authorization: Bearer <JWT_TOKEN>` (Identidad)
-   `X-Admin-Token: <INTERNAL_ADMIN_TOKEN>` (Infraestructura)

---

*Guía de Desarrolladores Dentalogic © 2026*

---

## 20. Agenda Móvil: Rangos y Scroll (2026-02-08)

### 20.1 Cálculo de Rango sin FullCalendar
En móvil, el componente `FullCalendar` no se renderiza. Esto rompe la lógica de `fetchData` que intenta acceder a `activeStart/End` vía `calendarRef`.
- **Solución**: Se implementó un fallback que calcula un rango de `+/- 7 días` basado en el estado `selectedDate`.

### 20.2 Scroll Isolation en Flexbox
Para que un componente hijo (`MobileAgenda`) tenga un scroll independiente dentro de un padre con `overflow-hidden`:
1. El contenedor padre debe ser `flex flex-col h-screen overflow-hidden`.
2. El contenedor intermedio debe ser `flex-1 min-h-0`.
3. El componente hijo debe ser `flex-1 min-h-0` con un área interna de `overflow-y-auto`.
- **Nota**: El `min-h-0` es mandatorio en Chrome y Safari para permitir que el hijo se contraiga y active su propio scrollbar.

### 20.3 Normalización de Fechas
Se recomienda el uso de `format(parseISO(...), 'yyyy-MM-dd')` de `date-fns` para todas las comparaciones de UI, evitando inconsistencias de huso horario entre el backend (UTC) y los dispositivos móviles.

## 21. Sovereign Analytics Engine (2026-02-08)

### 21.1 Lógica de Ingresos por Asistencia
Para garantizar el alineamiento con el flujo de caja real, los ingresos en el Dashboard **solo** se cuentan si:
1. La transacción en `accounting_transactions` tiene `status = 'completed'`.
2. El turno (`appointment_id`) asociado tiene `status` en `('completed', 'attended')`.
*No se deben sumar ingresos de turnos `scheduled` o `confirmed` hasta que se valide la presencia del paciente.*

### 21.2 Filtrado de Rangos (Query Params)
El endpoint `/admin/stats/summary` requiere el parámetro `range` (`weekly` | `monthly`) para calcular los intervalos SQL dinámicamente. 

### 21.3 Conteo de Conversaciones (Threads vs Messages)
Para evitar inflación de métricas, el conteo de conversaciones **debe** usar `DISTINCT from_number`. Un paciente puede intercambiar 200 mensajes, pero el Dashboard lo reportará como **1 conversación** para medir alcance real, no volumen de tokens.
泛
