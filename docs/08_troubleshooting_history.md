# Histórico de Problemas y Soluciones

Este documento registra problemas encontrados y sus soluciones para referencia futura.

## Startup, Routing y Persistencia (v4)

**Problema (2026-02-05):**
- **401 Unauthorized**: Frontend fallaba al conectar con Orchestrator por falta de token en build.
- **404 Not Found**: YCloud enviaba webhooks a `/webhook` pero el servicio esperaba `/webhook/ycloud`.
- **422 Unprocessable**: Mismatch de nombres en JSON entre WhatsApp de entrada (`from_number`/`text`) y Orchestrator (`phone`/`message`).
- **500 Internal Error (Bcrypt)**: `passlib` fallaba al chocar con `bcrypt 4.x` en Linux. Esto se manifestaba como un error de CORS en el navegador porque el servidor moría antes de inyectar los headers.
- **Pantalla en Blanco (Navigation)**: Al navegar a `/agenda` o `/pacientes`, la aplicación desaparecía.

**Solución Aplicada:**
- **Frontend (CORS/Auth)**: Se inyectó `VITE_ADMIN_TOKEN` en el Dockerfile y se agregó un `@app.exception_handler(Exception)` global en `main.py` para devolver JSON siempre, asegurando que los headers de CORS estén presentes incluso en errores 500.
- **Bcrypt Fix**: Se fijó `bcrypt==3.2.0` en `requirements.txt` y se agregó truncado de 72 bytes en las contraseñas para evitar el límite físico de la librería.
- **Navigation Fix**: Se cambió `path="/"` por `path="/*"` en `App.tsx` para permitir el matching de rutas anidadas en React Router 6.
- **Maintenance Robot (db.py)**: 
  - Se implementó un **Smart SQL Splitter** que divide el schema por `;` (respetando bloques `$$`).
  - Se creó un sistema de **Evolución por Parches** con auto-activación de CEO (Omega Prime).

**Estado:**
- ✅ Completamente estabilizado en v7.6 "Sovereign Platinum".

---

*Histórico de Problemas y Soluciones Nexus v3 © 2026*
泛
