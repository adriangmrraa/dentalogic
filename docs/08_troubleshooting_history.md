# Histórico de Problemas y Soluciones

Este documento registra problemas encontrados y sus soluciones para referencia futura.

## Platform UI - Errores de Configuración Nginx

**Problema (histórico v2):**
- El servicio `frontend_react` fallaba con errores de URL hardcodeada en nginx.conf
- La configuración de Nginx tenía dependencia de dominios que no existían

**Solución Aplicada:**
- Se modificó `frontend_react/nginx.conf` para ser genérico
- Se implementó auto-detección de API URL en JavaScript (`app.js`)
- La UI ahora detecta dinámicamente dónde está el Orchestrator

**En Nexus v3:**
- Platform UI es Vanilla JS, no React
- Auto-detección funciona correctamente
- No requiere configuración especial de Nginx

**Si tienes problemas:**
1. Verifica que `ORCHESTRATOR_SERVICE_URL` está correctamente seteada
2. Revisa logs de Platform UI
3. Consulta `docs/03_deployment_guide.md` sección "Troubleshooting"

---

## Deduplicación de Mensajes WhatsApp

**Problema:**
- El bot respondía doble en algunas ocasiones
- WhatsApp reintentaba webhooks si no recibía 200 rápido

**Solución:**
- Implementar Redis lock de 2 minutos (`dedup:whatsapp:{message_id}`)
- Validar firma HMAC antes de procesar
- Retornar 200 rápidamente al webhook

**Estado:**
- ✅ Implementado y funcional en Nexus v3
- Ver `docs/05_developer_notes.md` sección "Deduplicación"

---

## Transcripción de Audio Fallando

**Problema:**
- OpenAI Whisper fallaba ocasionalmente en descargas de audio
- Timeouts en descargas desde YCloud

**Solución:**
- Implementar retry con exponential backoff (3 intentos)
- Aumentar timeout de descarga a 30 segundos
- Cachear resultados de transcripción

**Estado:**
- ✅ Implementado en `whatsapp_service/main.py`
- Retry automático con `@retry` decorator

---

## Multi-Tenancy Inicial

**Problema (v2):**
- Soporte limitado para múltiples tiendas
- Credenciales hardcodeadas por tenant

**Solución (v3):**
- Tabla `tenants` en PostgreSQL
- Sincronización automática desde .env en startup (`sync_environment()`)
- Soporte dinámico vía header `X-Tenant-ID`
- Cada tenant tiene credenciales separadas

**Estado:**
- ✅ Completamente implementado en Nexus v3
- Ver `docs/02_environment_variables.md` sección "Multi-Tenancy"

---

## Handoff Humano - Lockout

**Problema (v2):**
- El lockout era infinito cuando un humano intervenía
- El bot nunca volvía a responder automáticamente

**Solución (v3):**
- Implementar timeout de 24 horas (`human_override_until`)
- Campo TIMESTAMPTZ en tabla `chat_conversations`
- Chequeo automático en inicio de `/chat`

**Estado:**
- ✅ Implementado y probado en Nexus v3
- Ver `docs/04_agent_logic_and_persona.md` sección "Mecanismo de Silencio"

---

## Performance de Búsquedas

**Problema:**
- Búsquedas en Tienda Nube eran lentas (hasta 5 seg)
- Latencia extra al usar microservicio externo

**Solución (v3):**
- Embedder herramientas directamente en Orchestrator
- Caché en Redis (1 hora TTL)
- Reducir from 10 a 3 resultados por defecto

**Estado:**
- ✅ Implementado en Nexus v3
- Tiempos típicos: 2-3 segundos (antes 3-5)

---

## Seguridad - Validación de Firmas

**Problema:**
- Webhooks sin validar podían ejecutarse
- Posible inyección de mensajes maliciosos

**Solución:**
- HMAC SHA256 para todos los webhooks (YCloud, n8n)
- Validación de timestamp (tolerance 5 minutos)
- Internal API Token entre microservicios

**Estado:**
- ✅ Implementado en v3
- Ver `docs/05_developer_notes.md` sección "Security"

---

## Logging y Observabilidad

**Problema (v2):**
- Logs dispersos, difíciles de parsear
- Difícil debugear errores en producción

**Solución (v3):**
- Structlog para JSON logs
- Correlación con correlation_id
- Métricas Prometheus
- Tabla `system_events` para auditoría

**Estado:**
- ✅ Completamente implementado
- Ver `docs/01_architecture.md` sección "Observabilidad"

---

## Referencias Útiles

- **Problemas de BD:** Ver `docs/03_deployment_guide.md` → Troubleshooting
- **Debugging local:** Ver `docs/05_developer_notes.md` → Debugging
- **Cambios arquitectura:** Ver `AGENTS.md` → Reglas Críticas

---

## Startup, Routing y Persistencia (v4)

**Problema (2026-02-05):**
- **401 Unauthorized**: Frontend fallaba al conectar con Orchestrator por falta de token en build.
- **404 Not Found**: YCloud enviaba webhooks a `/webhook` pero el servicio esperaba `/webhook/ycloud`.
- **422 Unprocessable**: Mismatch de nombres en JSON entre WhatsApp de entrada (`from_number`/`text`) y Orchestrator (`phone`/`message`).
- **500 Internal Error**: `asyncpg` fallaba con errores `NoneType` al procesar scripts SQL grandes, y se perdían tablas por filtros de comentarios demasiado estrictos.

**Solución Aplicada:**
- **Frontend**: Inyectar `VITE_ADMIN_TOKEN` como `ARG` y `ENV` en `frontend_react/Dockerfile`.
- **WhatsApp Service**: Agregar alias `@app.post("/webhook")` junto al original.
- **Orchestrator**: Normalizar el modelo `ChatRequest` con Pydantic Aliases/Properties para aceptar ambos formatos.
- **Maintenance Robot (db.py)**: 
  - Se implementó un **Smart SQL Splitter** que divide el schema por `;` (respetando bloques `$$`) y ejecuta cada sentencia individualmente.
  - Se creó un sistema de **Evolución por Parches** que corre bloques `DO $$` en cada inicio, reparando columnas faltantes (ej: `user_id` en `professionals`) sin necesidad de migraciones manuales.
  - Se agregó sanitización de comentarios para evitar que el splitter descarte sentencias legítimas.

**Estado:**
- ✅ Completamente estabilizado en v4 "Platinum Resilience".
- Ver `docs/01_architecture.md` para el flujo de datos normalizado.

---

*Histórico de Problemas y Soluciones Nexus v3 © 2025*
