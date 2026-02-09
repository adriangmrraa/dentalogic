# Especificación: Idioma en plataforma (Configuración) y agente IA (detección por mensaje)

**Fecha:** 2026-02-08  
**Estado:** Vigente  
**Relación:** Configuración (página CEO), identidad del agente (main.py, Protocolo Gala).

---

## 1. Objetivos

### 1.1 Selector de idioma en Configuración (UI de la plataforma)

- En la **página Configuración** (/configuracion) el CEO puede elegir el **idioma de la interfaz** de la plataforma: **Español**, **Inglés** o **Francés**.
- Ese idioma aplica a **todas las páginas** y a **todos los textos visibles** en el frontend (menús, títulos, botones, mensajes de error, placeholders, etc.).
- Objetivo: clínica en Dubai puede operar el panel en el idioma que prefiera (español, inglés o francés).

### 1.2 Agente IA: responder en el idioma del lead

- El **agente de IA** (asistente por WhatsApp/chat) **no** depende del selector de Configuración.
- Debe **detectar el idioma** del mensaje entrante del usuario/lead (español, inglés o francés) y **seguir la conversación en ese mismo idioma**.
- Si el lead escribe en inglés → la IA responde en inglés; si escribe en español → en español; si en francés → en francés.
- Contexto: sedes en Dubai reciben leads en los tres idiomas; la IA debe adaptarse a cada conversación sin que el CEO tenga que configurar nada por idioma.

---

## 2. Entradas y salidas

### 2.1 Selector de idioma (Configuración)

| Concepto | Detalle |
|----------|--------|
| **Entrada** | Elección del usuario en un selector: Español | English | Français. |
| **Persistencia** | Opción A: por **tenant** (cada sede puede tener su idioma de UI). Opción B: por **usuario** (preferencia en perfil). Opción C: **global** (una sola preferencia para toda la instalación). Recomendación: **por tenant** en `tenants.config.ui_language` para que cada sede pueda elegir. |
| **Salida** | Todo el frontend muestra textos en el idioma elegido (mediante claves i18n y un contexto/Provider que lea la preferencia). |
| **Valores** | `es` (Español), `en` (English), `fr` (Français). |

### 2.2 Agente IA (detección y respuesta)

| Concepto | Detalle |
|----------|--------|
| **Entrada** | Mensaje entrante del lead (`req.final_message`) y, opcionalmente, los últimos mensajes del historial para reforzar el idioma de la conversación. |
| **Detección** | Determinar si el idioma predominante es español, inglés o francés (heurística por palabras clave, o modelo/API de detección, o instrucción al LLM). |
| **Salida** | La respuesta del agente debe estar **íntegramente** en el idioma detectado (misma identidad y tono, pero en ese idioma). |
| **Idiomas soportados** | `es`, `en`, `fr`. Cualquier otro idioma puede tratarse como fallback a inglés o español según política. |

---

## 3. Esquema de datos y API

### 3.1 Persistencia del idioma de UI

- **Tabla/estructura:** `tenants.config` (JSONB ya existente).
- **Clave propuesta:** `tenants.config.ui_language` con valores `"es"` | `"en"` | `"fr"`. Si no existe, default `"es"`.
- **API sugerida:**
  - **GET** `/admin/settings/clinic` (o endpoint dedicado) debe devolver, entre otros, `ui_language` (o leer de `tenants.config`).
  - **PATCH** o **PUT** `/admin/settings/clinic` (o `/admin/settings/language`) para que el CEO actualice `ui_language`. El frontend enviará `{ "ui_language": "en" }` y el backend actualizará `tenants.config = jsonb_set(config, '{ui_language}', '"en"')` para el tenant resuelto (o allowed_ids según rol).

### 3.2 Frontend (i18n)

- **Contexto de idioma:** Un `LanguageContext` (o integración en `AuthContext`) que exponga `language` (es | en | fr) y `setLanguage`.
- **Origen del valor:** Al cargar la app, obtener el idioma desde la API (ej. GET `/admin/settings/clinic` o GET `/auth/me` con `preferred_language`/tenant config). Si el usuario es CEO y está en Configuración, al cambiar el selector se llama PATCH y se actualiza el contexto.
- **Traducciones:** Archivos o objetos por idioma (ej. `locales/es.json`, `locales/en.json`, `locales/fr.json`) con claves para cada texto visible. Los componentes usan `t('key')` en lugar de strings fijos.
- **Alcance:** Todas las vistas (Login, Dashboard, Agenda, Pacientes, Chats, Aprobaciones, Sedes, Configuración, Tratamientos, Perfil, etc.) y componentes compartidos (Sidebar, Layout, botones, mensajes de error).

### 3.3 Agente IA (backend)

- **Punto de intervención:** En `main.py`, antes de `agent_executor.ainvoke(...)`:
  1. **Detectar idioma** del mensaje actual (y opcionalmente del historial reciente).
  2. **Inyectar en el prompt** una instrucción explícita: “Respond ONLY in [Spanish|English|French]. Keep the same persona (assistant of Dr. Laura) and tone, but all your output must be in this language.”
- **Detección:**
  - Opción simple: heurística (listas de palabras típicas por idioma, o ratio de caracteres/patrones).
  - Opción robusta: llamada a un modelo de detección (ej. LangChain detector o API) o instruir al propio LLM en un paso previo (“Detect the language of this message: es, en, or fr”).
- **Prompt dinámico:** El system prompt (o un mensaje de sistema adicional por invocación) debe incluir la cláusula de idioma. El resto del prompt (identidad Dra. Laura, reglas de puntuación, flujo de agendamiento, tools) se mantiene; solo se añade la regla “respond in [detected_language]”.
- **Tools:** Las herramientas (`check_availability`, `book_appointment`, etc.) pueden seguir devolviendo datos en un formato interno; el LLM se encarga de presentar la respuesta al usuario en el idioma correcto. Si alguna tool devuelve mensajes fijos al usuario (ej. “Turno confirmado”), conviene que esos mensajes también estén parametrizados por idioma o que el LLM los reformule.

---

## 4. Criterios de aceptación

### 4.1 Configuración e idioma de la plataforma

- En **Configuración** hay un selector con tres opciones: **Español**, **English**, **Français**.
- Al cambiar la opción, se persiste (por tenant o por usuario, según diseño) y **toda la UI** pasa a mostrarse en ese idioma sin recargar a mano (o con recarga si se prefiere).
- Las rutas accesibles (Dashboard, Agenda, Pacientes, Chats, Aprobaciones, Sedes, Tratamientos, Perfil, Configuración, Login) muestran textos traducidos (no strings en un solo idioma).
- Soberanía: si la preferencia es por tenant, solo se usa/actualiza el `tenant_id` del usuario actual (CEO puede elegir para la sede que corresponda si hay multi-sede).

### 4.2 Agente IA

- Si el lead envía un mensaje **en inglés**, la siguiente respuesta del agente está **íntegramente en inglés** (saludo, explicaciones, preguntas).
- Si el lead envía un mensaje **en español**, la respuesta está **en español** (manteniendo voseo/tono cuando aplique).
- Si el lead envía un mensaje **en francés**, la respuesta está **en francés**.
- La **identidad** (asistente de la Dra. Laura, nombre de la clínica, flujos de agendamiento, uso de tools) se mantiene; solo cambia el idioma de la redacción.
- Si el idioma no se puede determinar o es otro, se define un fallback (ej. inglés o español) y se documenta.

---

## 5. Soberanía de datos

- **UI language:** Si se guarda en `tenants.config`, las escrituras deben filtrar por `tenant_id` (solo el tenant del usuario o los permitidos para CEO).
- **Chat/agente:** La detección de idioma se hace por mensaje/historial ya asociado a `tenant_id` y `from_number`; no se introduce nuevo dato sensible; las respuestas se almacenan en `chat_messages` como hasta ahora.

---

## 6. Resumen técnico

| Área | Acción |
|------|--------|
| **Backend – Config** | Exponer `ui_language` en GET/PATCH de configuración de clínica (o endpoint dedicado), guardando en `tenants.config.ui_language`. |
| **Frontend – Configuración** | Sustituir el placeholder de la página Configuración por una vista con selector de idioma (es, en, fr) que llame al PATCH y actualice el contexto de idioma. |
| **Frontend – i18n** | Introducir sistema de traducciones (archivos/objetos por idioma) y Provider/contexto de idioma; reemplazar strings fijos por `t('key')` en todas las vistas y componentes relevantes. |
| **Backend – Agente** | Antes de invocar el agente: (1) detectar idioma del mensaje (y opcionalmente historial); (2) inyectar en el system prompt (o mensaje de sistema) la instrucción “Respond only in [Spanish|English|French]”; (3) invocar el agente como hasta ahora. |

---

## 7. Implementación Fase 1 (2026-02-08)

- **Backend:** `GET /admin/settings/clinic` devuelve `ui_language` desde `tenants.config` (tenant resuelto). `PATCH /admin/settings/clinic` con `{ "ui_language": "es"|"en"|"fr" }` actualiza `tenants.config.ui_language`.
- **Agente agnóstico:** El system prompt ya no menciona "Dra. Laura Delgado". Se construye con `build_system_prompt(clinic_name, current_time, response_language, ...)`; el **nombre de la clínica** se obtiene de `tenants.clinic_name` para el `tenant_id` del chat. El agente es la "asistente de [nombre clínica]".
- **Detección de idioma:** `detect_message_language(text)` (heurística por palabras típicas es/en/fr) y se inyecta la instrucción "RESPOND ONLY IN Spanish|English|French" en el prompt.
- **Configuración (frontend):** Vista `ConfigView` en `/configuracion` con selector Español / English / Français que llama a PATCH y persiste por tenant. Solo CEO.

## 8. Implementación Fase 2 (i18n y efecto inmediato)

- **LanguageContext:** `frontend_react/src/context/LanguageContext.tsx` proporciona `language`, `setLanguage`, `t(key)` e `isLoading`. Al montar la app, si hay sesión se carga el idioma desde GET `/admin/settings/clinic`; el valor por defecto (y el del backend cuando no hay `ui_language` guardado) es **inglés** (`en`).
- **Traducciones:** Archivos `frontend_react/src/locales/es.json`, `en.json`, `fr.json` con claves `nav.*`, `common.*`, `config.*`, `login.*`, `layout.*`, etc. Cualquier componente que use `useTranslation()` y `t('clave')` muestra el texto en el idioma actual.
- **Efecto inmediato:** En ConfigView, al elegir un idioma se llama primero `setLanguage(value)` (actualiza el contexto y toda la UI al instante) y después PATCH para persistir en el servidor. No se espera al PATCH para ver el cambio.
- **Componentes traducidos:** Sidebar (menú y logout), Layout (título de app, sucursal, notificación de derivación), ConfigView (todos los textos). Otras vistas pueden migrar a `t()` progresivamente.
- **Idioma por defecto:** Plataforma y selector por defecto en **inglés** (frontend y backend).

## 9. Referencias

- AGENTS.md: Regla de Soberanía; agente agnóstico (nombre clínica inyectado); i18n y idioma por defecto inglés.
- `orchestrator_service/main.py`: `build_system_prompt`, `detect_message_language`, `chat_endpoint`.
- `frontend_react/src/views/ConfigView.tsx`: selector de idioma de la plataforma.
- `tenants.config` (JSONB): `calendar_provider`, `ui_language`.

---

## 10. i18n completado: selector impacta toda la plataforma (2026-02-08)

Tras el fix de idiomas de febrero 2026, el selector de Configuración aplica a **toda** la interfaz. No queda contenido visible sin traducir en las vistas principales ni en los componentes compartidos.

### 10.1 Alcance

- **LanguageProvider** envuelve toda la app en `App.tsx`; el idioma se persiste en `localStorage` y, con sesión, se carga/actualiza desde GET/PATCH `/admin/settings/clinic` (`ui_language`).
- **Vistas que usan `useTranslation()` y `t('...')`:** LoginView, DashboardView, AgendaView, PatientsView, PatientDetail, ChatsView, ProfessionalAnalyticsView, UserApprovalView, ProfileView, TreatmentsView, ClinicsView, ConfigView, Layout, Sidebar, ProtectedRoute, AppointmentForm, MobileAgenda, AnalyticsFilters.
- **Archivos de traducción:** `frontend_react/src/locales/es.json`, `en.json`, `fr.json` con namespaces: `nav`, `common`, `config`, `login`, `dashboard`, `analytics`, `agenda`, `patients`, `chats`, `approvals`, `patient_detail`, `professionals`, etc.

### 10.2 Detalle por área (fix aplicado)

| Área | Claves / textos traducidos |
|------|----------------------------|
| **Login** | Teléfono, Procesando, Solicitar Registro, Ingresar, especialidades (approvals.*). |
| **ProfessionalAnalyticsView** | Títulos, KPIs (tasa retención, realización, ingresos), tabla, insights, estados vacíos (no_tags, no_data). |
| **PatientDetail** | Botones Cancelar y Guardar Registro (common.cancel, patient_detail.save_record). |
| **ChatsView** | Silenciado/Manual, Sin mensajes, Sin nombre, Silenciado 24h override, badge de estado. |
| **PatientsView** | Eliminar (common.delete). |
| **ProfessionalsView** | General (fallback especialidad), Editar Perfil, Ver Horarios (tooltips/títulos). |
| **AgendaView** | Leyenda de origen: IA, Manual, GCal (`agenda.source_ai`, `source_manual`, `source_gcalendar`); tooltip "Origen" con `getSourceLabel(source, t)`. |
| **AnalyticsFilters** | Hint "Ctrl+Click para selección múltiple" (`chats.ctrl_click_multiple`). |

### 10.3 Criterio de verificación

- Al cambiar el idioma en Configuración, todas las pantallas listadas (y menús, botones, mensajes de error, placeholders) se muestran en el idioma elegido sin recargar manualmente. Los tres idiomas (es, en, fr) tienen las claves necesarias en los tres JSON de locales.
