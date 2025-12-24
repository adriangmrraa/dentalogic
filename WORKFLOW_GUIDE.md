# 🤝 Guía de Flujo de Trabajo y Colaboración (User + AI)

Este documento detalla la metodología de trabajo para asegurar el éxito, estabilidad y escalabilidad del proyecto **PointCoach**. Úsalo como referencia al iniciar nuevas sesiones con tu Agente.

---

## 1. 🔄 El Ciclo de Vida de una Tarea (The Loop)

Para cualquier nueva funcionalidad o corrección, seguimos este ciclo estricto:

### 1️⃣ Planificación (`PLANNING`)
*   **Tú (Usuario)**: Defines el objetivo (ej: "Arreglar el bug de login" o "Crear un nuevo endpoint").
*   **Yo (Agente)**:
    *   Investigo el código actual (`read_file`, `grep_search`).
    *   Creo un `implementation_plan.md` detallando qué archivos tocaré.
    *   **CRÍTICO**: Espero tu aprobación antes de escribir código.

### 2️⃣ Ejecución (`EXECUTION`)
*   Una vez aprobado el plan, edito los archivos (`replace_file_content`).
*   Mantengo un `task.md` actualizado para que sepas qué estoy haciendo.
*   Si encuentro algo inesperado, vuelvo a Planning y te aviso.

### 3️⃣ Verificación (`VERIFICATION`)
*   No basta con escribir código; hay que probarlo.
*   Yo puedo correr tests automáticos si existen.
*   **Tú** eres clave aquí: Te pediré que pruebes manualmente (ej: "Entra a la web y prueba el botón").
*   Creo un `walkthrough.md` con evidencias (screenshots/logs) de lo que hice.

### 4️⃣ Commit (`GIT`)
*   Después de verificar, **sellamos** el trabajo.
*   Yo te propondré los comandos:
    ```bash
    git add .
    git commit -m "feat: descripción de lo que hicimos"
    ```
*   Esto asegura puntos de restauración seguros.

---

## 2. 🌿 Estrategia de Git y Ramas

### Estado Actual
*   Trabajamos principalmente sobre la rama `main`.
*   Esto es aceptable para desarrollo rápido, per requiere **testeo riguroso** antes de cada commit.

### Recomendación (Mejora Continua)
*   **Feature Branches**: Para tareas grandes (es decir, la migración a React), deberíamos usar ramas:
    ```bash
    git checkout -b feature/nueva-funcionalidad
    # ... trabajo ...
    git checkout main
    git merge feature/nueva-funcionalidad
    ```
*   **Frecuencia**: Commits pequeños ("Atomic Commits"). Mejor 5 commits pequeños que 1 gigante que rompa todo.

---

## 3. 🏗️ Arquitectura y Microservicios

Entender el mapa es vital para no perderse:

### 🐍 Orchestrator (`/orchestrator_service`)
*   **Lenguaje**: Python (FastAPI).
*   **Rol**: Cerebro. Maneja la lógica de negocio, base de datos (PostgreSQL), memoria (Redis) y herramientas (Tools).
*   **Regla de Oro**: Nunca bloquear el "Main Loop" con tareas pesadas síncronas.

### 📱 WhatsApp Service (`/whatsapp_service`)
*   **Lenguaje**: Python.
*   **Rol**: Oídos y Boca. Recibe webhooks de Meta/YCloud y se los pasa al Orchestrator. Envía mensajes finales al usuario.
*   **Conexión**: Habla con Orchestrator vía HTTP.

### 🖥️ Platform UI (`/platform_ui`)
*   **Lenguaje**: Vanilla JS + HTML + CSS.
*   **Rol**: Panel de Control.
*   **Estado**: Estable y Productivo.
*   **Regla de Oro**: No usar frameworks complejos aquí. Mantener simple (`app.js`).

### 🚀 Next Gen (`/frontend_react` + `/bff_service`)
*   **Lenguaje**: React / Node.ts.
*   **Rol**: El futuro.
*   **Estado**: En construcción. Usar solo si el objetivo es explícitamente "Migración".

---

## 4. 💡 Cómo Iniciar una Nueva Sesión (Prompting)

Cuando abras un nuevo chat con la IA, copia y pega esto para darle el contexto perfecto:

> "Hola. Vamos a trabajar en el proyecto PointCoach.
> 1. Lee `AGENTS.md` para entender las reglas críticas.
> 2. Lee `WORKFLOW_GUIDE.md` para seguir nuestro proceso.
> 3. Revisa `task.md` y `project_context.md` en `.gemini/brain/...` (si tienes acceso) o pide que te los pase para entender el estado actual.
>
> Mi objetivo de hoy es: [TU OBJETIVO AQUÍ]"

---

## 5. ⚠️ Mandamientos (Do's and Don'ts)

*   ✅ **DO**: Pide un "Plan de Implementación" siempre.
*   ✅ **DO**: Verifica `git status` antes de empezar.
*   ❌ **DON'T**: Dejes que la IA modifique 20 archivos de golpe sin revisar.
*   ❌ **DON'T**: Olvides las credenciales. Si cambias `.env`, avisa.
*   ❌ **DON'T**: Rompas la producción. Prioriza la estabilidad de `platform_ui` sobre novedades en `frontend_react` a menos que sea esa la tarea.

---

Este documento es tu seguro de vida para el proyecto. ¡Éxito! 🚀
