# 🩰 Pointe Coach Agent - Nexus v3

Sistema de atención al cliente automatizado para **Tienda Nube** vía **WhatsApp**, impulsado por IA (**LangChain + GPT-4o**). El agente entiende consultas complejas, busca en el catálogo en tiempo real y gestiona derivaciones a humanos.

## 🚀 Guía Rápida de Inicio

1. **Clonar y Configurar:**
   ```bash
   cp .env.example .env
   # Completa las claves de OpenAI, YCloud y Tienda Nube
   ```
2. **Levantar Infraestructura:**
   ```bash
   docker-compose up --build
   ```
3. **Acceder:**
   - **Orchestrator:** `http://localhost:8000`
   - **Admin UI:** `http://localhost:3000` (puerto depende de tu config local)

---

## 📚 Documentación Detallada

Para mantener o extender este proyecto, consulta los siguientes manuales:

### ⚙️ [01. Arquitectura del Sistema](docs/01_architecture.md)
Entiende cómo interactúan el `whatsapp_service`, el `orchestrator_service` y la base de datos. Flujo de mensajes y diagramas.

### 🔑 [02. Configuración (Variables de Entorno)](docs/02_environment_variables.md)
Referencia completa de todas las variables necesarias para el branding, conexión a APIs y configuración SMTP.

### ☁️ [03. Guía de Despliegue (EasyPanel)](docs/03_deployment_guide.md)
Pasos para subir el proyecto a producción, mapeo de puertos, configuración de dominios y healthchecks.

### 🧠 [04. Identidad y Reglas de la IA](docs/04_agent_logic_and_persona.md)
Detalle sobre la personalidad "Argentina Buena Onda", reglas de envíos, prohibiciones técnicas y Call to Actions.

### 🛠️ [05. Notas para Desarrolladores](docs/05_developer_notes.md)
Técnicas de debugging, cómo agregar nuevas Tools, gestión de memoria en Redis y tips de mantenimiento.

---

## 🛠️ Tecnologías Core
- **Lenguaje:** Python 3.11 (FastAPI)
- **IA:** LangChain + OpenAI (GPT-4o-mini / Whisper)
- **Base de Datos:** PostgreSQL + Redis
- **Infraestructura:** Docker + EasyPanel
- **Canal:** WhatsApp (vía YCloud API)

---
*Desarrollado para Pointe Coach Shop.*

