# Pointe Coach Microservices

Este proyecto implementa un agente de chat para WhatsApp que interactúa con la plataforma de e-commerce Tienda Nube, utilizando una arquitectura de microservicios con LangChain.

## Arquitectura

- **whatsapp_service**: Maneja webhooks de WhatsApp (ycloud), verifica firmas y reenvía mensajes al orquestador.
- **orchestrator_service**: Contiene el agente LangChain, gestiona memoria, dedupe y orquesta tools.
- **platform_ui**: Dashboard administrativo (React) para gestionar tenants, credenciales y analizar métricas.
- **tiendanube_service**: Expone tools para interactuar con la API de Tienda Nube.

## Requisitos

- Docker y Docker Compose
- Python 3.11 (para desarrollo local)

## Configuración

1. Copia `.env.example` a `.env` y completa las variables de entorno.

2. Asegúrate de tener las claves API necesarias:
   - Tienda Nube API Key
   - YCloud API Key y Webhook Secret
   - OpenAI API Key

## Ejecución Local

```bash
docker-compose up --build
```

Los servicios estarán disponibles en:
- orchestrator_service: http://localhost:8000
- tiendanube_service: http://localhost:8001
- whatsapp_service: http://localhost:8002
- Postgres: localhost:5432

## Tests

```bash
# Instalar dependencias de test
pip install pytest pytest-asyncio

# Ejecutar tests
pytest
```

## Troubleshooting

- **Init SQL no corre**: Si la base de datos ya fue inicializada, el script `001_schema.sql` no volverá a correr. Para resetear la DB:
  ```bash
  docker-compose down -v
  docker-compose up --build
  ```

## Deploy en EasyPanel

1. **WhatsApp Service**: Es el único servicio que debe exponerse públicamente (puerto 8000 -> HTTP).
2. **Orchestrator y TiendaNube**: Deben mantenerse internos, accesibles solo por la red de Docker.
3. **Variables**: Configura todas las variables de `.env` en el panel de Environment Variables.
4. **Healthchecks**: Configura `/health` como la ruta de chequeo.

## Validación y Tests

```bash
# Correr suite de pruebas
pytest -q
```

