# Dentalogic - Environment Variables Reference

Quick reference for EasyPanel deployment.

## Service Ports

| Service       | Internal Port |
|---------------|---------------|
| orchestrator  | 8000          |
| bff_service   | 8001          |
| whatsapp      | 8002          |
| frontend      | 3000          |
| postgres      | 5432          |
| redis         | 6379          |

## Internal Service URLs

```bash
ORCHESTRATOR_SERVICE_URL=http://orchestrator:8000
WHATSAPP_SERVICE_URL=http://whatsapp:8002
BFF_SERVICE_URL=http://bff_service:8001
```

## Core Variables (All Backend Services)

```bash
POSTGRES_DSN=postgresql+asyncpg://postgres:password@postgres:5432/dentalogic
REDIS_URL=redis://redis:6379/0
INTERNAL_API_TOKEN=secret-internal-token-2024
LOG_LEVEL=INFO
```

## orchestrator (8000)

```bash
OPENAI_API_KEY=sk-proj-...
CLINIC_NAME=Clínica Dental
CLINIC_LOCATION=Buenos Aires, Argentina
GOOGLE_CREDENTIALS={"type":"service_account",...}
GOOGLE_CALENDAR_ID=primary
YCLOUD_API_KEY=...
YCLOUD_WEBHOOK_SECRET=...
WHATSAPP_SERVICE_URL=http://whatsapp:8002
ADMIN_TOKEN=admin-secret-token
```

## whatsapp (8002)

```bash
OPENAI_API_KEY=sk-proj-...
YCLOUD_API_KEY=...
YCLOUD_WEBHOOK_SECRET=...
ORCHESTRATOR_SERVICE_URL=http://orchestrator:8000
INTERNAL_API_TOKEN=secret-internal-token-2024
```

## bff_service (8001)

```bash
POSTGRES_DSN=postgresql+asyncpg://...
REDIS_URL=redis://redis:6379/0
ORCHESTRATOR_SERVICE_URL=http://orchestrator:8000
WHATSAPP_SERVICE_URL=http://whatsapp:8002
INTERNAL_API_TOKEN=secret-internal-token-2024
ADMIN_TOKEN=admin-secret-token
JWT_SECRET=your-jwt-secret
```

## frontend (3000)

```bash
VITE_API_URL=https://your-domain.com/api
VITE_BFF_URL=https://your-domain.com/bff
NODE_ENV=production
```
