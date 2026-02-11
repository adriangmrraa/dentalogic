# Especificación: Landing pública y flujo demo (conversión)

## Objetivo

Ofrecer una **página de entrada pública** (landing) orientada a conversión para leads con una o más clínicas dentales. La página es accesible **sin login** y permite probar la plataforma en un clic (login automático demo), probar el agente IA por WhatsApp o iniciar sesión con cuenta propia.

## Contexto

- **Única ruta pública** (además de `/login`): no requiere autenticación.
- Pensada para **campañas de marketing**: copy orientado a beneficio, CTAs claros, móvil-first y optimizada para conversión.
- URL base de la plataforma: la misma del frontend desplegado (ej. `https://dentalogic-frontend.ugwrjq.easypanel.host`).

## Requerimientos implementados

### Rutas y acceso

| Ruta | Acceso | Descripción |
|------|--------|-------------|
| `/demo` | Público | Landing con información estratégica, credenciales de prueba y CTAs. |
| `/login` | Público | Formulario de login o registro. |
| `/login?demo=1` | Público | Modo demo: prellenado de credenciales y botón "Entrar a la demo" para login automático. |
| `/*` (resto) | Protegido | Requiere sesión; Layout + vistas (Dashboard, Agenda, Chats, etc.). |

### Landing (`/demo`)

- **Contenido:** Título/hero (Dentalogic, beneficio principal), subtítulo de valor ("Probá la plataforma en un clic. Sin tarjeta. Acceso inmediato"), bloque "Qué incluye la demo" (agenda, agente IA, analíticas), credenciales de prueba en bloque colapsable (`<details>`), y tres acciones:
  1. **Probar app:** Enlace a `/login?demo=1` (login automático con cuenta demo).
  2. **Probar Agente IA por WhatsApp:** Enlace externo a `https://wa.me/5493435256815?text=...` con mensaje predefinido (ej. consulta por turnos de limpieza).
  3. **Iniciar sesión con mi cuenta:** Enlace a `/login` (formulario normal, sin demo).

- **Estilo:** Alineado con la plataforma (paleta medical, botones `btn-primary` / secundarios, cards tipo glass, `rounded-2xl`). Optimizado para **móvil** (touch targets ≥44px, `min-h-[100dvh]`, safe-area, tipografía responsive) y orientado a **conversión** (CTA principal destacado, copy de confianza, credenciales colapsables).

### Login con demo (`/login?demo=1`)

- Al cargar la página con `?demo=1`, se prellenan email y contraseña con la cuenta demo configurada.
- Se muestra un bloque simplificado: mensaje "Cuenta demo lista…" y botón **"Entrar a la demo"** que envía `POST /auth/login` con esas credenciales y, al éxito, redirige al dashboard.
- Enlace "Iniciar sesión con mi cuenta" lleva a `/login` sin parámetros (formulario completo).
- El resto del formulario (campos email/contraseña, registro, footer) se oculta en modo demo.

### Credenciales demo (configuración)

- Email y contraseña de la cuenta demo están definidos en el frontend (`LoginView.tsx`) para el flujo `?demo=1`. La landing muestra las mismas credenciales en el bloque colapsable "Credenciales de prueba".
- Número de WhatsApp para "Probar Agente IA": `+5493435256815` (configurable en `LandingView.tsx`).

## Archivos implicados

| Archivo | Cambio |
|---------|--------|
| `frontend_react/src/App.tsx` | Ruta pública `<Route path="/demo" element={<LandingView />} />`. |
| `frontend_react/src/views/LandingView.tsx` | Vista de la landing (hero, card, CTAs, estilos, móvil + conversión). |
| `frontend_react/src/views/LoginView.tsx` | Detección de `?demo=1`, prellenado, `handleDemoLogin`, UI simplificada para demo. |

## Criterios de aceptación

- [ ] Cualquier usuario (no logueado) puede acceder a `/demo` y ver la landing.
- [ ] "Probar app" lleva a `/login?demo=1` y, con un clic en "Entrar a la demo", el usuario queda logueado y redirigido al dashboard.
- [ ] "Probar Agente IA por WhatsApp" abre WhatsApp con el número y mensaje predefinido.
- [ ] "Iniciar sesión con mi cuenta" lleva a `/login` sin parámetros.
- [ ] La landing es usable y legible en móvil (touch targets, scroll, safe-area).
- [ ] Estética consistente con el resto de la plataforma (medical, glass, botones).

## Base de datos y backend

No hay cambios de esquema ni de API. El login demo usa el endpoint existente `POST /auth/login` con las credenciales de la cuenta demo.

## Verificación

- Manual: abrir `/demo` en desktop y móvil; ejecutar los tres CTAs y comprobar redirecciones y login demo.
- No se requieren tests automatizados nuevos para esta especificación.
