# 🤖 AGENTS.md: La Guía Suprema para el Mantenimiento del Proyecto

Este documento es el manual de instrucciones definitivo para cualquier IA (LLM) que necesite modificar o extender este sistema. Sigue estas reglas y descripciones técnicas para evitar regresiones y errores fatales.

---

## 🏗️ Arquitectura de Microservicios

### 📡 Core Intelligence (Orchestrator)
El cerebro central es `orchestrator_service`. Gestiona la lógica de la IA, el ruteo administrativo y la base de datos principal.

### 📱 Percepción (WhatsApp Service)
Ubica en `whatsapp_service`. Se encarga de la integración cruda con YCloud/Meta, envío de archivos y detección de **Echoes** (mensajes enviados desde el móvil físico).

### 🎨 Control (Platform UI)
El dashboard administrativo en `platform_ui`. Es una aplicación **Vanilla JS**. No usa frameworks complejos, por lo que la gestión del estado global es manual y crítica.

---

## 💾 Base de Datos (PostgreSQL)

### 🚨 Tablas Críticas y Foreign Keys
1.  **`tenants`**: Tabla madre. Todo cuelga de aquí.
2.  **`chat_conversations`**: Metadata de chats.
    *   `human_override_until`: Si está en el futuro, la IA **NO** responde.
3.  **`tenant_human_handoff_config`**: Nueva tabla para SMTP y derivación.
    *   `tenant_id` es **PRIMARY KEY** y **FOREIGN KEY** (1:1 con tenants).
4.  **`credentials`**: Almacén de API Keys.
    *   `scope`: `global` (general) vs `tenant` (específico).

---

## 📜 Reglas de Oro para Agentes (Precauciones)

### 1. 🐍 Python / FastAPI (Backend)
-   **LA TRAMPA DE PYDANTIC (CRÍTICO):** Nunca definas un `BaseModel` (ej. `HumanOverrideModel`) dentro de una función asíncrona. Esto rompe el parser de Python y lanza un `SyntaxError` bizarro. **Define siempre las clases al nivel superior del archivo.**
-   **Cascada de Borrado Manual:** Para eliminar un tenant, debes seguir este orden exacto en una transacción para no romper las Foreign Keys:
    1.  Eliminar `tenant_human_handoff_config`.
    2.  Eliminar `chat_conversations` (esto dispara el borrado en cascada de mensajes y media).
    3.  Eliminar `credentials` específicos del tenant.
    4.  Eliminar el `tenant`.
-   **Passwords SMTP:** Al devolver la configuración al frontend, el password **DEBE** ir enmascarado como `********`. Al recibir un guardado, si el password trae asteriscos, **NO** lo sobrescribas; mantén el valor actual encriptado en la DB.

### 2. ⚡ JavaScript (Frontend)
-   **Variables Globales de Estado:** Variables como `allChats` **DEBEN** estar definidas en el scope global (inicio de `app.js`). Si las defines dentro de una función como `loadChats`, otras funciones (como `toggleHumanOverride`) fallarán con un `ReferenceError`.
-   **Verificación de Bloqueo:** Para saber si un chat está bloqueado en el UI, nunca compares strings de fecha. Usa:
    ```javascript
    const isLocked = new Date(chat.human_override_until) > new Date();
    ```

### 3. 🔄 Sincronización de Entorno
-   La función `sync_environment()` en `admin_routes.py` sincroniza el tenant "por defecto". 
-   **Regla:** Solo debe crear/actualizar el tenant si las variables de entorno `STORE_NAME` y `BOT_PHONE_NUMBER` **existen y no están vacías**. Si se eliminan del entorno, el sistema ya no debe recrearlas automáticamente, permitiendo el borrado total desde el UI.

---

## 🛠️ Implementación del Human Handoff (Derivación)

### 📧 Flujo de Correo
-   Se utiliza el modo de herramienta `derivhumano` en la IA.
-   El orquestador intercepta el llamado, lee la tabla `tenant_human_handoff_config`, desencripta la contraseña SMTP y envía un correo HTML al propietario.
-   **Trigger:** Al activarse la derivación, se pone `human_override_until` en un valor muy lejano (ej. año 2099) para pausar la IA.

### 🚦 El Toggle de Override
-   Ubicado en la cabecera del chat en el Platform UI.
-   **Estados:**
    -   🔴 **Rojo (Atención Humana)**: Bot silenciado. El humano tiene el control.
    -   🟢 **Verde (Agente Activo)**: El bot responde solo.
-   El frontend debe refrescar este estado basándose en los datos JSON que vienen de `/admin/chats`.

---

## 🚀 Guía de Endpoints (Referencia Rápida)

| Endpoint | Método | Acción |
| :--- | :--- | :--- |
| `/admin/handoff` | GET/POST | Configuración SMTP y reglas de email. |
| `/admin/conversations/{id}/human-override` | POST | Activa/Desactiva el silencio de la IA manualmente. |
| `/admin/tenants/{id}/details` | GET | Devuelve info, conexiones y estado de configuración global. |
| `/admin/chats` | GET | Lista de conversaciones con flags de bloqueo actualizados. |

---

## 📈 Observabilidad
-   Usa la tabla `system_events` para loguear errores graves desde el orquestador.
-   Cualquier error en el envío de emails SMTP debe quedar registrado allí para debugging.

---

## 🔮 Arquitectura "Next Gen" (En Desarrollo)
El proyecto contiene carpetas para una futura migración a React:
1.  **`frontend_react`**: Aplicación React (posiblemente Vite/Next) que reemplazará a `platform_ui`.
2.  **`bff_service`**: "Backend for Frontend". Probablemente un servicio Nodejs/Express intermedio.
    *   **Estado:** Experimental / En desarrollo.
    *   **Precaución:** Los agentes actuales deben priorizar `platform_ui` (Vanilla) y `orchestrator_service` parar mantener la estabilidad del sistema productivo, a menos que se les instruya específicamente trabajar en la migración.

---
**Recuerda:** Este código está diseñado para ser multi-tenant. Siempre usa `tenant_id` en tus consultas para no mezclar datos de diferentes tiendas.
