# Análisis Integral del Proyecto: Pointe Coach Agent

Este documento proporciona una visión detallada de la arquitectura, componentes y funcionalidades del proyecto **Pointe Coach Agent**, un sistema de microservicios diseñado para actuar como un asistente de ventas inteligente para tiendas en **Tienda Nube** a través de **WhatsApp**.

---

## 1. Visión General
El sistema permite que los clientes de una tienda interactúen con un bot de IA por WhatsApp. Este bot puede consultar el catálogo de productos, verificar estados de pedidos, listar cupones y derivar la conversación a un humano si es necesario. La IA utiliza **LangChain** y **OpenAI** (GPT-4/GPT-4o) para razonar y ejecutar herramientas (tools).

---

## 2. Arquitectura de Microservicios

El proyecto está compuesto por 4 servicios principales desarrollados en **Python (FastAPI)** y un frontend en **React (Vite/TypeScript)**.

### A. `orchestrator_service` (El Cerebro)
Es el servicio central que gestiona la lógica de la IA.
- **Tecnologías**: FastAPI, LangChain, OpenAI, Redis, PostgreSQL.
- **Responsabilidades**:
  - Orquestar las respuestas del bot.
  - Gestionar la memoria de la conversación (vía Redis).
  - Implementar "deduplicación" para evitar responder múltiples veces al mismo mensaje.
  - Ejecutar herramientas (Tools) como búsqueda de productos y pedidos.
  - Gestionar el esquema de la base de datos (migraciones automáticas en `lifespan`).
  - **Admin API**: Rutas para gestionar tenants (tiendas), credenciales y ver métricas.

### B. `whatsapp_service` (El Conector)
Maneja la comunicación externa con WhatsApp a través de **YCloud**.
- **Responsabilidades**:
  - Recibir Webhooks de YCloud.
  - Verificar la firma de seguridad de los mensajes.
  - **Debouncing/Buffering**: Agrupa mensajes del usuario que llegan seguidos para responder una sola vez.
  - **Transcripción de Audio**: Utiliza OpenAI Whisper para convertir audios de voz en texto.
  - Enviar mensajes de vuelta al usuario (texto e imágenes).

### C. `tiendanube_service` (La Interfaz de Tienda)
Actúa como un puente (proxy) especializado entre el orquestador y la API de Tienda Nube.
- **Responsabilidades**:
  - Exponer endpoints que el orquestador usa como herramientas.
  - Manejar errores de la API de Tienda Nube (Rate limiting, auth, etc.).
  - Simplificar los datos de productos para ahorrar tokens en la IA.

### D. `bff_service` (Backend for Frontend)
Un servicio ligero diseñado para servir al frontend administrativo.
- **Responsabilidades**: Agregar datos y proporcionar endpoints específicos para el dashboard.

### E. `frontend_react` / `platform_ui` (Panel de Control)
Dashboard administrativo para dueños de tiendas o administradores del sistema.
- **Tecnologías**: React, Vite, Tailwind CSS, TypeScript.
- **Funcionalidades**:
  - Listado y gestión de chats en tiempo real.
  - Configuración de Tenants (ID de tienda, Tokens de acceso).
  - Configuración de Prompts específicos por tienda.
  - Gestión de credenciales globales.

---

## 3. Flujo de Datos

1. **Usuario envía mensaje** -> WhatsApp -> **`whatsapp_service`** (Webhook).
2. **`whatsapp_service`** verifica firma, agrupa mensajes y los envía al **`orchestrator_service`**.
3. **`orchestrator_service`**:
   - Carga el historial de chat (Redis).
   - Consulta la configuración del Tenant (Postgres) para obtener el Prompt y el Token de Tienda Nube.
   - Envía el input a la IA de OpenAI.
   - Si la IA necesita datos (ej: "¿Qué zapatillas tienes?"), ejecuta una **Tool** llamando al **`tiendanube_service`**.
4. **`tiendanube_service`** consulta la API oficial, simplifica la respuesta y la devuelve.
5. **IA genera respuesta final** (en formato JSON estructurado).
6. **`orchestrator_service`** guarda la respuesta y se la envía de vuelta al **`whatsapp_service`**.
7. **`whatsapp_service`** envía la burbuja de texto o imagen al usuario final.

---

## 4. Repositorio y Archivos Clave

- `docker-compose.yml`: Define toda la infraestructura (servicios + Postgres + Redis).
- `orchestrator_service/main.py`: Contiene el agente LangChain y la lógica de migración de DB.
- `orchestrator_service/admin_routes.py`: Lógica extensa para el panel administrativo.
- `whatsapp_service/main.py`: Manejo de webhooks y lógica de reintentos.
- `tiendanube_service/main.py`: Mapeo de herramientas a la API de Tienda Nube.
- `.env.example`: Lista todas las variables necesarias (Claves API, URLs, etc.).

---

## 5. Esquema de Base de Datos (Principales)
- `tenants`: Configuración de cada tienda (nombre, prompt, tokens, configuración de bot).
- `chat_conversations`: Rastreo de hilos de conversación activos.
- `chat_messages`: Historial persistente de todos los mensajes.
- `credentials`: Almacenamiento seguro de claves API (opcionalmente encriptadas).
- `tenant_human_handoff_config`: Configuración para derivación a humanos vía email.

---

## 6. Próximos Pasos Sugeridos
1. **Configuración de .env**: Es vital completar las claves de OpenAI, YCloud y Tienda Nube.
2. **Personalización de Prompts**: El archivo `orchestrator_service/main.py` tiene un prompt base que puede ser ajustado por Tenant desde la UI.
3. **Despliegue**: El proyecto está preparado para **EasyPanel** con configuraciones de healthchecks y volúmenes para Postgres.
