# 🤖 AGENTS.md: La Guía Suprema para el Mantenimiento del Proyecto (Nexus v7.6)

Este documento es el manual de instrucciones definitivo para cualquier IA o desarrollador que necesite modificar o extender este sistema. Sigue estas reglas para evitar regresiones.

---

## 🏗️ Arquitectura de Microservicios (v7.6 Platinum)

### 📡 Core Intelligence (Orchestrator) - `orchestrator_service`
El cerebro central. Gestiona el agente LangChain, la memoria y la base de datos.
- **Seguridad de Triple Capa:** JWT para identidad, `X-Admin-Token` para infraestructura, y estado `pending` para nuevos registros.
- **Maintenance Robot (db.py):** Sistema de auto-curación de base de datos. Los parches PL/pgSQL se ejecutan en cada arranque para asegurar el esquema.
- **WebSocket / Socket.IO:** Sincronización en tiempo real de la agenda.

### 📱 Percepción y Transmisión (WhatsApp Service) - `whatsapp_service`
Maneja la integración con YCloud y la IA de audio (Whisper).

### 🎨 Control (Frontend React)
- **Routing:** Usa `path="/*"` en el router raíz de `App.tsx` para permitir rutas anidadas.
- **AuthContext:** Gestiona el estado de sesión y rol del usuario.

---

## 💾 Base de Datos y Lógica de Bloqueo

### 🚦 Mecanismo de Silencio (Human Override)
- **Duración:** 24 horas. Se guarda en `human_override_until`.

### 🤖 Maintenance Robot (Self-Healing)
- **Protocolo Omega Prime:** Se auto-activa al primer administrador (CEO) para evitar bloqueos en despliegues nuevos.

---

## 🛠️ Herramientas (Tools) - Nombres Exactos
- `check_availability`: Consulta disponibilidad de turnos.
- `book_appointment`: Registra un turno.
- `triage_urgency`: Analiza síntomas.
- `derivhumano`: Derivación a humano y bloqueo de 24h.

---

## 📜 Reglas de Oro para el Código

### 1. 🐍 Python (Backend)
- **Auth Layers**: Siempre usa `Depends(get_current_user)` para rutas protegidas.
- **Exception handling**: Usa el manejador global en `main.py` para asegurar estabilidad de CORS.

### 2. 🔄 React (Frontend)
- **Wildcard Routes**: Siempre pon `/*` en rutas que contengan `Routes` hijos.
- **Axios**: Los headers `Authorization` y `X-Admin-Token` se inyectan automáticamente en `api/axios.ts`.

---

## 📈 Observabilidad
- Los links de activación se imprimen en los logs como `WARNING` (Protocolo Omega).

---

## 🛠️ Available Skills Index

| Skill Name | Trigger | Descripción |
| :--- | :--- | :--- |
| **Sovereign Backend Engineer** | *FastAPI, Backend* | Experto en lógica de negocio, seguridad, 24h window y API multi-tenant. |
| **Nexus UI Developer** | *React, Frontend* | Especialista en interfaces dinámicas, reordering en tiempo real y Socket.IO. |
| **Prompt Architect** | *Identity, Persona* | Mantenimiento de la identidad (Dra. Laura Delgado) y tono rioplatense. |
| **DB Schema Surgeon** | *Postgres, SQL* | Gestión avanzada de modelos, índices y parches SQL. |
| **Maintenance Robot Architect**| *db.py, miguel* | Arquitecto de evolución de base de datos segura y self-healing. |
| **Mobile Adaptation Architect**| *responsivo, mobile* | Especialista en transformación de UI desktop a mobile sin regresiones. |

---
*Actualizado: 2026-02-06 - Protocolo Platinum Resilience v7.6*
泛
