# Especificación: Calendario híbrido (Local / Google) por clínica y profesional

**Versión:** 1.0  
**Fecha:** 2026-02-09  
**Estado:** Especificación técnica (entrevista + criterios de aceptación).

---

## 1. Resumen ejecutivo

El sistema debe permitir por **clínica** elegir si se usa **calendario local** (solo BD) o **Google Calendar**. Cuando la clínica usa Google, las credenciales son **una sola cuenta de Google** (JSON en variables de entorno); dentro de esa cuenta el CEO crea **un calendario por profesional** y asigna el **ID de ese calendario** a cada profesional. La IA y toda la plataforma deben distinguir en todo momento si consultar disponibilidad y turnos en **local** o en **Google**, y en Google usar el `google_calendar_id` del profesional correspondiente.

---

## 2. Por qué la IA dice que “no puede ver la disponibilidad”

### 2.1. Flujo actual (cerebro híbrido)

- En `main.py`, la tool **`check_availability`** hace lo siguiente:
  1. Obtiene `tenant_id` del contexto (clínica del lead/paciente).
  2. Llama a **`get_tenant_calendar_provider(tenant_id)`** → lee `tenants.config.calendar_provider` en BD (`'local'` o `'google'`).
  3. **Si es `local`:** solo usa la tabla `appointments` y (opcionalmente) bloques locales; no llama a Google.
  4. **Si es `google`:** para cada profesional activo del tenant que tenga **`google_calendar_id`** no nulo, llama a `gcal_service.get_events_for_day(calendar_id=prof.google_calendar_id, ...)` para traer eventos de ese calendario, los persiste en `google_calendar_blocks`, y luego calcula huecos libres junto con los turnos ya guardados en `appointments`.

### 2.2. Causas típicas de “no puedo ver disponibilidad”

1. **Clínica con `calendar_provider = 'local'`**  
   Si en BD la clínica queda siempre en `local`, la IA **no** usa Google. Si además no hay turnos en `appointments` para esa fecha, o los profesionales no tienen `working_hours` configurados correctamente, la respuesta puede ser “no hay huecos” o un error genérico.

2. **`calendar_provider` no se persiste al elegir Google en el modal de clínicas**  
   Si al guardar en “Gestión de Clínicas” el valor **Google** no se persiste (por bug en frontend o backend), la clínica sigue en `local`. Entonces la IA sigue usando solo BD y no Google.

3. **Clínica en Google pero profesionales sin `google_calendar_id`**  
   En `check_availability`, para cada profesional con `calendar_provider == 'google'` se hace `if not cal_id: continue`. Si **ningún** profesional del tenant tiene `google_calendar_id`, no se consulta ningún calendario de Google y la disponibilidad puede quedar vacía o errónea.

4. **Credenciales de Google**  
   Si `GOOGLE_CREDENTIALS` (JSON completo en env) no está definido o es inválido, `gcal_service` no construye el cliente y las llamadas a la API no se hacen → la IA no “ve” eventos en Google.

5. **Excepciones no controladas**  
   Si alguna parte de `check_availability` lanza (parseo de fecha, BD, GCal), la tool devuelve un mensaje genérico tipo “No pude consultar la disponibilidad” y la IA repite que no puede ver disponibilidad.

**Conclusión:** Para que la IA “vea” disponibilidad con Google hace falta: (a) que la clínica tenga **`calendar_provider = 'google'` persistido**; (b) que cada profesional que atiende en esa clínica tenga **`google_calendar_id`** con el ID del calendario creado en la cuenta de Google; (c) que las credenciales en env estén correctas; (d) que no falle el parseo de fecha ni la consulta a BD/GCal.

---

## 3. Modelo de datos y soberanía

### 3.1. Clínica (tenant)

| Dato | Descripción | Soberanía |
|------|-------------|-----------|
| `tenants.config` (JSONB) | Incluye `calendar_provider`: `'local'` \| `'google'` | Por tenant. Todas las consultas por `tenant_id`. |
| Persistencia | GET `/admin/tenants` devuelve `config`. PUT `/admin/tenants/{id}` debe aceptar `calendar_provider` en el body y actualizar `config` de forma persistente. | No ejecutar SQL directo; usar endpoints existentes. |

### 3.2. Profesional

| Dato | Descripción | Soberanía |
|------|-------------|-----------|
| `professionals.google_calendar_id` | ID del calendario de Google asignado a ese profesional (calendario creado en la cuenta cuyas credenciales están en env). | Por profesional; profesional ya está asociado a `tenant_id`. |
| Uso | Solo relevante cuando la **clínica** del profesional tiene `calendar_provider = 'google'`. En “local” se ignora para disponibilidad externa. | |

### 3.3. Credenciales Google

- **Una cuenta de Google** (Service Account o cuenta estándar según diseño): el JSON completo de credenciales va en variable de entorno (ej. `GOOGLE_CREDENTIALS`).
- **Un calendario por profesional** dentro de esa cuenta; el CEO asigna el **ID de ese calendario** en el campo “ID Calendario” del profesional.
- No se debe hardcodear credenciales en código; solo leer desde env (o desde un vault si se define así).

---

## 4. Comportamiento esperado por flujo

### 4.1. Gestión de clínicas (modal Editar / Nueva clínica)

- **Selector calendar provider:** Local | Google (obligatorio, valor por defecto coherente, ej. `local`).
- **Al guardar (PUT/POST):** El valor elegido se envía en el body como `calendar_provider` (nivel raíz del JSON). El backend actualiza `tenants.config` de forma persistente (merge con `config` existente, clave `calendar_provider`).
- **Al reabrir el modal:** El valor mostrado debe ser el que está en BD (`config.calendar_provider`). Si siempre se muestra “local” después de elegir Google, hay que corregir: (1) que el backend realmente persista, (2) que GET devuelva `config`, (3) que el frontend rellene el formulario con `clinica.config?.calendar_provider`.

**Criterio de aceptación:** El CEO puede cambiar una clínica de Local a Google (o viceversa), guardar, cerrar el modal y volver a abrirlo: el valor debe seguir siendo el guardado (y en BD debe verse el mismo valor).

### 4.2. Modal “Editar perfil” del profesional (tuerca en Personal Activo)

- **Campos actuales a mantener:** Clínica(s), email, nombre completo, teléfono, especialidad, número de licencia, si está activo.
- **Campo nuevo:** **ID Calendario (Google)** (cuadro de texto, opcional).
  - Visible siempre (o condicionado a que la clínica use Google, según UX).
  - Si la clínica usa Google, este ID es el que usa la IA y la agenda para ese profesional (calendario creado en la cuenta de las credenciales env).
  - Persistencia: PATCH/PUT del profesional debe incluir `google_calendar_id` y actualizar `professionals.google_calendar_id` para ese profesional (respetando `tenant_id` / sedes vinculadas si aplica).

**Criterio de aceptación:** El CEO puede editar un profesional, ingresar un ID de calendario de Google y guardar. En BD `professionals.google_calendar_id` debe quedar guardado; en la siguiente consulta de disponibilidad para esa clínica (Google), la tool debe usar ese ID.

### 4.3. Registro de un profesional nuevo (login/registro)

- **Campo opcional:** **ID Calendario (Google)** (texto, puede ir vacío).
- Si el usuario lo completa, se envía en el payload de registro y se persiste (por ejemplo al crear la fila en `professionals` o en un paso posterior). Si no, queda vacío y el CEO puede asignarlo después desde “Editar perfil”.
- No es obligatorio para registrarse.

**Criterio de aceptación:** En la pantalla de registro aparece el campo; se puede enviar vacío o con un ID; si se envía, queda guardado y visible después en el perfil.

### 4.4. Agente de IA (tools y contexto)

- **check_availability:** Ya implementa el cerebro híbrido: lee `calendar_provider` del tenant y, si es `google`, usa `gcal_service` con el `google_calendar_id` de cada profesional. No inventar disponibilidad; si falla la consulta, devolver mensaje claro.
- **book_appointment / cancel / reschedule:** Deben seguir usando el mismo criterio: si la clínica es Google y el profesional tiene `google_calendar_id`, operar sobre ese calendario (y opcionalmente sincronizar con `appointments`/eventos GCal).
- **System prompt / instrucciones:** La IA debe “entender” que:
  - Si la clínica usa **local**, la disponibilidad y los turnos se consultan/registran solo en la BD (tabla `appointments` y lógica local).
  - Si la clínica usa **Google**, la disponibilidad se arma con eventos de Google (por profesional, usando su `google_calendar_id`) más lo que ya esté en `appointments`.
- En todas las partes donde se use calendario (agenda web, IA, sincronización) se debe **distinguir** local vs Google y, en Google, usar el calendario del profesional correcto.

**Criterio de aceptación:** Para una clínica con `calendar_provider = 'google'` y al menos un profesional con `google_calendar_id` y credenciales válidas, cuando el usuario pregunte “¿tenés turnos el lunes?”, la IA debe poder ejecutar `check_availability` y responder con disponibilidad real (o un mensaje claro si no hay huecos).

---

## 5. Credenciales y variables de entorno

- **Google Calendar (cuenta única):** Usar el JSON completo de credenciales en variable de entorno (ej. `GOOGLE_CREDENTIALS`). El backend ya usa esto en `gcal_service.py` para construir el cliente de la API.
- No ejecutar SQL directo para credenciales; si en el futuro se usan tokens por tenant (ej. connect-sovereign / Auth0), debe documentarse por separado y seguir respetando el mismo flujo: local vs Google por clínica, y por profesional el `google_calendar_id`.

---

## 6. Resumen de tareas técnicas (checklist)

- [ ] **Backend – Persistencia de `calendar_provider`:** Verificar que PUT `/admin/tenants/{id}` con body `{ "calendar_provider": "google" }` (o `"local"`) actualice correctamente `tenants.config` y que GET devuelva ese `config`.
- [ ] **Frontend – Modal clínicas:** Asegurar que al guardar se envíe `calendar_provider` en el body y que al abrir el modal se muestre `clinica.config?.calendar_provider` (y que tras guardar se refresque la lista para no mostrar dato viejo).
- [ ] **Frontend – Modal Editar perfil (profesional):** Añadir campo “ID Calendario (Google)” y persistirlo vía endpoint existente (o nuevo) que actualice `professionals.google_calendar_id`.
- [ ] **Frontend – Registro de profesional:** Añadir campo opcional “ID Calendario (Google)” y enviarlo en el payload de registro; backend persistir en `professionals` cuando corresponda.
- [ ] **Backend – Tools y lógica:** Confirmar que `check_availability` y `book_appointment` (y cancel/reschedule) usen `get_tenant_calendar_provider(tenant_id)` y, si es Google, el `google_calendar_id` del profesional. Ajustar system prompt para que la IA “sepa” dónde se consulta la disponibilidad (local vs Google).
- [ ] **Credenciales:** Confirmar que `GOOGLE_CREDENTIALS` (JSON completo) esté documentado y que el servicio use solo esa variable (o la que se defina) para la cuenta única de Google.

---

## 7. Referencias

- AGENTS.md: reglas de oro, cerebro híbrido, tools.
- `orchestrator_service/main.py`: `get_tenant_calendar_provider`, `check_availability`, `book_appointment`.
- `orchestrator_service/admin_routes.py`: GET/PUT tenants, connect-sovereign (opcional).
- `orchestrator_service/gcal_service.py`: uso de `GOOGLE_CREDENTIALS`.
- `docs/CONTEXTO_AGENTE_IA.md`: stack y flujos.
- `docs/14_google_calendar_sync_fix.spec.md`: sincronización GCal.

---

*Documento generado según workflow Specify. No se ejecuta SQL directo; los cambios de esquema se realizan vía parches idempotentes en `db.py` o migraciones controladas.*
