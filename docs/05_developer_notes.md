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
泛
