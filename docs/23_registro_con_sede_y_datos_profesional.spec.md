# Especificación: Registro con sede y datos de profesional en login

**Fecha:** 2026-02-08  
**Estado:** Vigente

## 1. Objetivo

En la **página de login**, al solicitar una **nueva cuenta** (registro), el formulario debe pedir **explícitamente**:

- **Sede / Clínica**: selector con **todas las clínicas** de la plataforma, para que cualquiera que quiera registrarse pueda elegir a qué sede se asocia.
- **Resto de datos** que requiere el esquema de profesionales: rol (Profesional dental, Secretaría, CEO), especialidad (para profesionales), teléfono, matrícula, nombre y apellido, etc.

Todo esto ocurre **antes** de la aprobación o rechazo por el CEO: la solicitud ya incluye sede y datos completos del profesional/secretaria/CEO.

## 2. Roles y datos por tipo de cuenta

| Rol              | Datos obligatorios en registro                    | Datos opcionales              |
|------------------|---------------------------------------------------|-------------------------------|
| Profesional      | email, password, nombre, apellido, **sede**      | especialidad, teléfono, matrícula, Google Calendar ID |
| Secretaría       | email, password, nombre, apellido, **sede**      | teléfono                      |
| Director / CEO   | email, password, nombre, apellido                | sede (opcional; puede no tener sede asignada al registrarse) |

Para **professional** y **secretary** la **sede es obligatoria**: se crea una fila en `professionals` con `tenant_id` elegido e `is_active = FALSE` hasta que el CEO apruebe.

## 3. Entradas y salidas

### 3.1 Listado de clínicas (público)

- **GET /auth/clinics** (sin autenticación)  
- **Respuesta:** `[{ "id": number, "clinic_name": string }, ...]`  
- Uso: poblar el selector de sede en el formulario de registro.

### 3.2 Registro

- **POST /auth/register**  
- **Body:**  
  - `email`, `password`, `role` (`professional` | `secretary` | `ceo`)  
  - `first_name`, `last_name`  
  - **`tenant_id`** (obligatorio si `role` es `professional` o `secretary`)  
  - `specialty` (opcional; recomendado para professional)  
  - `phone_number` (opcional)  
  - `registration_id` / matrícula (opcional)  
  - `google_calendar_id` (opcional)  

- **Efecto:**  
  - INSERT en `users` con `status = 'pending'`.  
  - Si `role` es `professional` o `secretary`: INSERT en `professionals` con `tenant_id` del body, `is_active = FALSE`, y los campos anteriores (specialty, phone_number, registration_id, working_hours por defecto).  
  - Al aprobar, el CEO ya no tiene que elegir sede: la solicitud ya la trae.

## 4. Criterios de aceptación

- En la pantalla de login, al elegir "Solicitar acceso" / registro, el formulario muestra:
  - Selector **Sede / Clínica** con todas las clínicas (GET /auth/clinics).
  - Nombre, apellido, email, contraseña, rol (Profesional / Secretaría / CEO).
  - Si rol = Profesional: campo **Especialidad** (selector o texto), **Teléfono**, **Matrícula** (opcional).
  - Si rol = Secretaría: **Teléfono** opcional.
- La sede es **obligatoria** para profesional y secretaría (validación en front y back).
- Tras enviar el registro, el usuario queda en estado `pending` y con fila en `professionals` (si aplica) con la sede elegida; al aprobar, solo se activa (sin tener que "vincular a sede" desde el modal de Personal).

## 5. Soberanía

- Todas las escrituras en `professionals` usan `tenant_id` (del body en registro, validado contra existencia en `tenants`).
- GET /auth/clinics es público pero solo devuelve `id` y `clinic_name` (sin datos sensibles).

## 6. Referencias

- AGENTS.md: Regla de Soberanía (tenant_id).
- docs/20_professionals_personal_activo_sync.spec.md: flujo de aprobación y profesionales.
- Esquema: `professionals` (tenant_id, user_id, first_name, last_name, email, phone_number, specialty, registration_id, is_active, working_hours, created_at, updated_at).
