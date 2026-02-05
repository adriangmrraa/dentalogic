# 🤖 AGENTS.md: La Guía Suprema para el Mantenimiento del Proyecto (Nexus v3)

Este documento es el manual de instrucciones definitivo para cualquier IA o desarrollador que necesite modificar o extender este sistema. Sigue estas reglas para evitar regresiones.

---

## 🏗️ Arquitectura de Microservicios (Nexus v3)

### 📡 Core Intelligence (Orchestrator) - `orchestrator_service`
El cerebro central. Gestiona el agente LangChain, la memoria y la base de datos.
- **Cambio Crítico v3:** Las herramientas de **Tienda Nube** (`search_specific_products`, `orders`, etc.) ahora están **embebidas** directamente en el orquestador para reducir latencia. Ya no dependen obligatoriamente del microservicio externo `tiendanube_service`.
- **Memoria:** Ventana de los últimos 20 mensajes (Redis + Postgres).
- **WebSocket / Socket.IO:** Servidor Socket.IO embebido para sincronización en tiempo real de la agenda. Emite eventos `NEW_APPOINTMENT`, `APPOINTMENT_UPDATED`, `APPOINTMENT_DELETED` cuando se crean, actualizan o cancelan turnos.

### 📱 Percepción y Transmisión (WhatsApp Service) - `whatsapp_service`
Maneja la integración con YCloud y la IA de audio.
- **Transcripción:** Usa **OpenAI Whisper** para audios. 
- **Bug Fix Crítico:** Todo mensaje recibido (texto o multimedia) debe capturar la respuesta del orquestador y ejecutar `send_sequence`. Anteriormente, los audios enviaban la señal al orquestador pero ignoraban el resultado.

### 🎨 Control (Platform UI)
Dashboard en `platform_ui`. Es **Vanilla JS**. Mantén la gestión de estado simple y global al inicio de `app.js`.

---

## 🎭 La Persona: "Argentina Buena Onda"

El agente tiene una personalidad estricta definida en `sys_template`:

1.  **Tono:** Cálido, informal, voseo argentino ("Mirá", "Te cuento", "Fijate").
2.  **Prohibido:** No usar "Usted", ni lenguaje robótico de telemarketing.
3.  **Regla de Envíos:** Puede nombrar empresas (`SHIPPING_PARTNERS`), pero tiene **PROHIBIDO** dar precios o tiempos. Frase obligatoria: *"El costo y tiempo de envío se calculan al final de la compra según tu ubicación."*
4.  **CTA Obligatorio:** Toda respuesta debe cerrar con un Call to Action (Fitting para puntas, Link web para el resto).

---

## 💾 Base de Datos y Lógica de Bloqueo

### 🚦 Mecanismo de Silencio (Human Override)
- **Activación:** Se dispara vía `derivhumano` o cuando llega un "echo" de un humano (`whatsapp.smb.message.echoes`).
- **Duración:** **24 horas** (antes era infinito). Se guarda en `human_override_until`.
- **Enforcement:** El Orchestrator chequea este timestamp al inicio de `/chat`. Si el bloqueo está activo, retorna `ignored` y la IA no se ejecuta.

### 🤖 Maintenance Robot (Self-Healing)
El orquestador en `orchestrator_service/db.py` gestiona la salud de la DB automáticamente:
- **Zero-Touch Evolution**: Si necesitas agregar campos, edita la lista `patches` en `db.py` usando bloques `DO $$`.
- **Idempotencia**: El sistema verifica si la columna existe antes de intentar crearla.
- **Auto-Bootstrap**: Al primer inicio, aplica el `dentalogic_schema.sql` si no hay tablas.

### 🛠️ Herramientas (Tools) - Nombres Exactos
- `search_specific_products`: Búsqueda general por keyword.
- `search_by_category`: Búsqueda filtrada por categoría.
- `browse_general_storefront`: Último recurso (catálogo general).
- `orders`: Consulta de pedido (ID sin #).
- `derivhumano`: Derivación a mail y bloqueo bionivel.
- `check_availability`: Consulta disponibilidad de turnos para una fecha específica.
- `book_appointment`: Registra un turno en la base de datos y emite evento `NEW_APPOINTMENT` vía WebSocket.
- `triage_urgency`: Analiza síntomas para clasificar urgencia (emergency, high, normal, low).

---

## 📜 Reglas de Oro para el Código

### 1. 🐍 Python (Backend)
- **Definición de Modelos:** Define clases Pydantic siempre al nivel superior, nunca dentro de funciones.
- **Variables de Entorno:** Usa `os.getenv` con valores por defecto consistentes con `.env.example`.
- **NameError Fix:** Asegúrate de que las variables usadas en `sys_template` (como `SHIPPING_PARTNERS`) estén definidas en el scope de la función antes de invocar el f-string.

### 2. 🔄 Sincronización
- La función `sync_environment()` en `admin_routes.py` es la que "crea" el tenant inicial en base al `.env` si la DB está vacía.

---

## 📈 Observabilidad
- Usa `system_events` para auditar fallos en el bridge MCP o errores de SMTP. 
- Revisa `http_request_completed` en los logs para monitorear latencia del agente.

---

---

## 🛠️ Available Skills Index

| Skill Name | Trigger | Descripción |
| :--- | :--- | :--- |
| **Maintenance Robot Architect** | *db.py, miguel, robot* | Arquitecto de evolución de base de datos segura y self-healing. |
| **DB Schema Surgeon** | *Postgres, SQL, Schema* | Gestión avanzada de modelos, índices y parches PL/pgSQL. |
| **Sovereign Backend Engineer** | *FastAPI, Backend* | Experto en lógica de negocio, seguridad y API multi-tenant. |
| **Nexus UI Developer** | *React, Frontend* | Especialista en interfaces dinámicas y sincronización Socket.IO. |
| **Spec Architect** | *Spec, .spec.md* | Generador de especificaciones técnicas bajo estándar SDD v2.0. |

---
**Recuerda:** Este sistema es multi-tenant pero está optimizado para despliegues single-tenant rápidos vía EasyPanel. Mantén las credenciales en variables de entorno siempre que sea posible.

*Actualizado: 2026-02-05 - Protocolo Platinum Resilience*
