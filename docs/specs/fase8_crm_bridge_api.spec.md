# SPEC: CRM Bridge API (Dentalogic <-> CRM VENTAS)

**Fase:** 8 - CRM Bridge API
**Prioridad:** ALTA
**Bloqueado por:** Fase 4 (Marketing Hub & Leads), Fase 5 (Integraciones)
**Origen:** Integración cross-VPS Dentalogic - CRM VENTAS
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

Dentalogic y CRM VENTAS son aplicaciones desplegadas en **VPS separados** (EasyPanel). No comparten red interna ni base de datos. Toda comunicación entre ambos sistemas debe realizarse a través de una **API pública HTTPS** con autenticación por token compartido.

**Objetivos:**
- Exponer datos de leads y métricas de Dentalogic para consumo por CRM VENTAS
- Recibir actualizaciones de estado de leads desde CRM VENTAS
- Enviar leads nuevos a CRM VENTAS en tiempo real (webhook push) o por polling periódico
- Garantizar trazabilidad, seguridad y resiliencia en toda la comunicación

---

## 2. Arquitectura de Comunicación

```
┌─────────────────────┐         HTTPS (public)         ┌─────────────────────┐
│                     │  ─────────────────────────────► │                     │
│     DENTALOGIC      │  POST /bridge/v1/incoming-lead  │    CRM VENTAS       │
│     (VPS A)         │                                 │    (VPS B)          │
│                     │  ◄───────────────────────────── │                     │
│  Exposes:           │  GET  /bridge/v1/leads          │  Consumes:          │
│  - /bridge/v1/*     │  GET  /bridge/v1/metrics/*      │  - Polling cada 5m  │
│                     │  POST /bridge/v1/webhooks/*     │  - O webhook push   │
└─────────────────────┘                                 └─────────────────────┘
         │                                                        │
         │  X-Bridge-Token (shared secret)                        │
         │  X-Request-Id (tracing)                                │
         └────────────────────────────────────────────────────────┘
```

---

## 3. Autenticación y Seguridad

### 3.1 Token de Autenticación

Todas las peticiones entre sistemas deben incluir el header `X-Bridge-Token`.

**Configuración:**
```
# En Dentalogic (.env)
BRIDGE_API_TOKEN=secret-token-shared-between-apps
CRM_VENTAS_BRIDGE_URL=https://crm-ventas.example.com

# En CRM VENTAS (.env)
BRIDGE_API_TOKEN=secret-token-shared-between-apps
DENTALOGIC_BRIDGE_URL=https://dentalogic.example.com
```

**Validación del token:**
```typescript
function validateBridgeToken(req: Request): boolean {
  const token = req.headers['x-bridge-token'];
  const validTokens = process.env.BRIDGE_API_TOKEN!.split(','); // soporta múltiples tokens
  return validTokens.includes(token);
}
```

### 3.2 Rate Limiting

- **Límite:** 100 requests por minuto por token
- Respuesta al exceder: `429 Too Many Requests`
- Header de respuesta: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### 3.3 Request Tracing

Todas las respuestas incluyen:
- `X-Request-Id`: UUID v4 generado por el servidor (o propagado si viene en la petición)

### 3.4 HTTPS Obligatorio

- Solo se aceptan conexiones HTTPS en producción
- Requests HTTP plano se rechazan con `301 Redirect` o `403 Forbidden`

### 3.5 IP Whitelist (Opcional)

```
# En Dentalogic (.env)
BRIDGE_ALLOWED_IPS=203.0.113.10,198.51.100.20
```

- Si `BRIDGE_ALLOWED_IPS` está definido, solo se aceptan requests desde esas IPs
- Si está vacío o no definido, se acepta cualquier IP (solo valida token)

### 3.6 Rotación de Tokens

- `BRIDGE_API_TOKEN` acepta valores separados por coma para soportar múltiples tokens activos
- Flujo de rotación: agregar nuevo token -> desplegar ambos apps -> remover token antiguo
- Ambos tokens son válidos simultáneamente durante la ventana de rotación

### 3.7 Audit Log

Cada llamada a la Bridge API se registra con:
```typescript
interface BridgeAuditEntry {
  request_id: string;
  timestamp: string;       // ISO 8601
  method: string;          // GET, POST
  path: string;            // /bridge/v1/leads
  source_ip: string;
  token_hash: string;      // SHA256 truncado del token usado
  status_code: number;
  response_time_ms: number;
  error?: string;
}
```

---

## 4. Requerimientos Técnicos - API Expuesta por Dentalogic

### 4.1 `GET /bridge/v1/health`

**Descripción:** Health check del Bridge API.

**Autenticación:** No requiere token.

**Respuesta:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-03-27T10:00:00Z"
}
```

### 4.2 `GET /bridge/v1/leads`

**Descripción:** Lista paginada de leads de demo/marketing.

**Query Params:**
| Param | Tipo | Requerido | Default | Descripción |
|-------|------|-----------|---------|-------------|
| `status` | string | No | - | Filtrar por estado (`new`, `contacted`, `appointment_scheduled`, `converted`, `lost`) |
| `source` | string | No | - | Filtrar por fuente (`meta_ads`, `google_ads`, `whatsapp`, `website`, etc.) |
| `from_date` | string (ISO 8601) | No | - | Fecha inicio |
| `to_date` | string (ISO 8601) | No | - | Fecha fin |
| `page` | number | No | 1 | Página actual |
| `limit` | number | No | 50 | Resultados por página (max 100) |

**Respuesta:**
```json
{
  "data": [
    {
      "id": "lead_abc123",
      "name": "Juan Pérez",
      "phone": "+573001234567",
      "email": "juan@email.com",
      "source": "meta_ads",
      "status": "new",
      "engagement_score": 75,
      "events_count": 12,
      "first_seen": "2026-03-20T08:00:00Z",
      "last_seen": "2026-03-27T09:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 230,
    "total_pages": 5
  }
}
```

### 4.3 `GET /bridge/v1/leads/:id`

**Descripción:** Perfil completo de un lead con timeline de eventos.

**Respuesta:**
```json
{
  "id": "lead_abc123",
  "name": "Juan Pérez",
  "phone": "+573001234567",
  "email": "juan@email.com",
  "source": "meta_ads",
  "status": "contacted",
  "engagement_score": 75,
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "blanqueamiento-marzo",
  "first_seen": "2026-03-20T08:00:00Z",
  "last_seen": "2026-03-27T09:30:00Z",
  "events": [
    {
      "type": "page_view",
      "data": { "page": "/servicios/blanqueamiento", "duration_seconds": 45 },
      "timestamp": "2026-03-20T08:00:00Z"
    },
    {
      "type": "demo_request",
      "data": { "form_id": "demo-form-1" },
      "timestamp": "2026-03-20T08:05:00Z"
    },
    {
      "type": "whatsapp_click",
      "data": { "message": "Hola, quiero info sobre blanqueamiento" },
      "timestamp": "2026-03-21T10:00:00Z"
    }
  ]
}
```

### 4.4 `GET /bridge/v1/metrics/summary`

**Descripción:** Métricas agregadas de leads y conversión.

**Query Params:**
| Param | Tipo | Requerido | Default |
|-------|------|-----------|---------|
| `period` | string | No | `30d` (`7d`, `30d`, `90d`, `all`) |

**Respuesta:**
```json
{
  "period": "30d",
  "total_leads": 230,
  "new_leads": 45,
  "whatsapp_conversations": 120,
  "demo_appointments": 35,
  "converted_patients": 18,
  "conversion_rate": 7.83,
  "top_sources": [
    { "source": "meta_ads", "count": 95, "conversion_rate": 9.5 },
    { "source": "google_ads", "count": 60, "conversion_rate": 8.3 },
    { "source": "whatsapp", "count": 45, "conversion_rate": 6.7 }
  ]
}
```

### 4.5 `GET /bridge/v1/metrics/funnel`

**Descripción:** Datos del embudo de conversión.

**Query Params:**
| Param | Tipo | Requerido | Default |
|-------|------|-----------|---------|
| `period` | string | No | `30d` |

**Respuesta:**
```json
{
  "period": "30d",
  "funnel": [
    { "stage": "visit", "count": 1200, "percentage": 100 },
    { "stage": "demo_request", "count": 230, "percentage": 19.2 },
    { "stage": "whatsapp_contact", "count": 120, "percentage": 10.0 },
    { "stage": "appointment_scheduled", "count": 35, "percentage": 2.9 },
    { "stage": "converted", "count": 18, "percentage": 1.5 }
  ]
}
```

### 4.6 `POST /bridge/v1/webhooks/lead-update`

**Descripción:** Endpoint para que CRM VENTAS notifique cambios de estado de un lead.

**Request Body:**
```json
{
  "lead_id": "lead_abc123",
  "new_status": "appointment_scheduled",
  "updated_by": "vendedor@crm.com",
  "notes": "Cita agendada para el 30 de marzo",
  "idempotency_key": "upd_xyz789"
}
```

**Respuesta:**
```json
{
  "success": true,
  "lead_id": "lead_abc123",
  "previous_status": "contacted",
  "new_status": "appointment_scheduled",
  "updated_at": "2026-03-27T11:00:00Z"
}
```

---

## 5. Requerimientos Técnicos - CRM VENTAS Consume

### 5.1 Modo Polling

- CRM VENTAS consulta `GET /bridge/v1/leads?from_date={last_sync}` cada **5 minutos**
- Almacena `last_sync` timestamp para consultas incrementales
- Configurable vía env var `BRIDGE_POLL_INTERVAL_MS=300000`

### 5.2 Modo Webhook Push (Preferido)

Dentalogic envía leads nuevos en tiempo real a CRM VENTAS.

**Endpoint en CRM VENTAS:** `POST {CRM_VENTAS_BRIDGE_URL}/bridge/v1/incoming-lead`

**Configuración en Dentalogic:**
```
CRM_VENTAS_BRIDGE_URL=https://crm-ventas.example.com
```

**Request que Dentalogic envía:**
```json
{
  "lead": {
    "id": "lead_abc123",
    "name": "Juan Pérez",
    "phone": "+573001234567",
    "email": "juan@email.com",
    "source": "meta_ads",
    "status": "new",
    "engagement_score": 75,
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "blanqueamiento-marzo",
    "first_seen": "2026-03-27T09:00:00Z",
    "last_seen": "2026-03-27T09:00:00Z",
    "events": [
      {
        "type": "demo_request",
        "data": { "form_id": "demo-form-1" },
        "timestamp": "2026-03-27T09:00:00Z"
      }
    ]
  },
  "idempotency_key": "lead_abc123_2026-03-27T09:00:00Z"
}
```

**Respuesta esperada de CRM VENTAS:**
```json
{
  "received": true,
  "crm_lead_id": "crm_456"
}
```

---

## 6. Contratos de Datos (JSON Schemas)

### 6.1 Lead

```typescript
interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  engagement_score: number;          // 0-100
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  first_seen: string;                // ISO 8601
  last_seen: string;                 // ISO 8601
  events: LeadEvent[];
}

type LeadStatus = 'new' | 'contacted' | 'appointment_scheduled' | 'converted' | 'lost';
type LeadSource = 'meta_ads' | 'google_ads' | 'whatsapp' | 'instagram' | 'facebook' | 'website' | 'referral' | 'manual';
```

### 6.2 LeadEvent

```typescript
interface LeadEvent {
  type: LeadEventType;
  data: Record<string, any>;
  timestamp: string;                 // ISO 8601
}

type LeadEventType =
  | 'page_view'
  | 'demo_request'
  | 'whatsapp_click'
  | 'whatsapp_conversation'
  | 'form_submission'
  | 'appointment_booked'
  | 'status_change'
  | 'note_added';
```

### 6.3 Metric

```typescript
interface MetricSummary {
  period: string;                    // '7d' | '30d' | '90d' | 'all'
  total_leads: number;
  new_leads: number;
  whatsapp_conversations: number;
  demo_appointments: number;
  converted_patients: number;
  conversion_rate: number;           // porcentaje
  top_sources: SourceMetric[];
}

interface SourceMetric {
  source: LeadSource;
  count: number;
  conversion_rate: number;
}
```

### 6.4 FunnelStage

```typescript
interface FunnelStage {
  stage: 'visit' | 'demo_request' | 'whatsapp_contact' | 'appointment_scheduled' | 'converted';
  count: number;
  percentage: number;                // relativo al primer stage
}
```

---

## 7. Manejo de Errores

### 7.1 Formato Estándar de Error

Todas las respuestas de error siguen este formato:

```json
{
  "error": "Lead not found",
  "code": "LEAD_NOT_FOUND",
  "details": {
    "lead_id": "lead_xyz999"
  }
}
```

### 7.2 Códigos de Error

| HTTP Status | Código | Descripción |
|-------------|--------|-------------|
| 400 | `INVALID_REQUEST` | Request malformado o parámetros inválidos |
| 401 | `UNAUTHORIZED` | Token faltante o inválido |
| 403 | `FORBIDDEN` | IP no autorizada |
| 404 | `LEAD_NOT_FOUND` | Lead no existe |
| 409 | `DUPLICATE_REQUEST` | Idempotency key ya procesada (retorna respuesta original) |
| 429 | `RATE_LIMIT_EXCEEDED` | Excedió 100 req/min |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |
| 503 | `SERVICE_UNAVAILABLE` | Servicio temporalmente no disponible |

### 7.3 Idempotencia

- Todas las peticiones `GET` son naturalmente idempotentes
- Peticiones `POST` deben incluir `idempotency_key` en el body
- Si una `idempotency_key` ya fue procesada, se retorna la respuesta original con status `409`
- Las claves de idempotencia expiran después de 24 horas

### 7.4 Circuit Breaker (Push a CRM VENTAS)

Cuando Dentalogic no puede comunicarse con CRM VENTAS:

1. **Closed (normal):** Envía requests normalmente
2. **Open (fallo detectado):** Después de 5 fallos consecutivos, deja de enviar por 60 segundos
3. **Half-open:** Después del timeout, intenta un request de prueba
4. **Recovery:** Si el request de prueba tiene éxito, vuelve a estado Closed

**Cola de reintentos:**
- Los leads que no pudieron enviarse se almacenan en una cola persistente
- Reintentos con backoff exponencial: 1min, 5min, 15min, 1h, 6h
- Máximo 5 reintentos antes de marcar como `failed_delivery`
- Endpoint para consultar cola: `GET /bridge/v1/outbox` (solo uso interno/admin)

---

## 8. Variables de Entorno

### Dentalogic

| Variable | Requerido | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `BRIDGE_API_TOKEN` | Si | `tk_abc123,tk_def456` | Tokens válidos (separados por coma) |
| `CRM_VENTAS_BRIDGE_URL` | Si | `https://crm.example.com` | URL base de CRM VENTAS |
| `BRIDGE_ALLOWED_IPS` | No | `203.0.113.10,198.51.100.20` | IPs permitidas (vacío = todas) |
| `BRIDGE_RATE_LIMIT` | No | `100` | Requests por minuto (default: 100) |
| `BRIDGE_CIRCUIT_BREAKER_THRESHOLD` | No | `5` | Fallos antes de abrir circuito |
| `BRIDGE_CIRCUIT_BREAKER_TIMEOUT` | No | `60000` | Timeout en ms antes de half-open |

### CRM VENTAS

| Variable | Requerido | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `BRIDGE_API_TOKEN` | Si | `tk_abc123,tk_def456` | Tokens válidos (mismos que Dentalogic) |
| `DENTALOGIC_BRIDGE_URL` | Si | `https://dentalogic.example.com` | URL base de Dentalogic |
| `BRIDGE_POLL_INTERVAL_MS` | No | `300000` | Intervalo de polling en ms (default: 5 min) |
| `BRIDGE_ALLOWED_IPS` | No | `203.0.113.10` | IPs permitidas |

---

## 9. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Bridge API Authentication

  Scenario: Request con token válido
    Given un request a GET /bridge/v1/leads
    And el header X-Bridge-Token contiene un token válido
    When el request es procesado
    Then la respuesta tiene status 200
    And la respuesta incluye header X-Request-Id

  Scenario: Request sin token
    Given un request a GET /bridge/v1/leads
    And no se incluye el header X-Bridge-Token
    When el request es procesado
    Then la respuesta tiene status 401
    And el body contiene { "code": "UNAUTHORIZED" }

  Scenario: Request con token inválido
    Given un request a GET /bridge/v1/leads
    And el header X-Bridge-Token contiene "token-incorrecto"
    When el request es procesado
    Then la respuesta tiene status 401

  Scenario: Request desde IP no autorizada
    Given BRIDGE_ALLOWED_IPS está configurado como "10.0.0.1"
    And un request llega desde IP "192.168.1.1"
    When el request es procesado
    Then la respuesta tiene status 403
    And el body contiene { "code": "FORBIDDEN" }

  Scenario: Rate limit excedido
    Given un token válido ha realizado 100 requests en el último minuto
    When se envía un request adicional
    Then la respuesta tiene status 429
    And el header X-RateLimit-Remaining es 0

  Scenario: Rotación de tokens
    Given BRIDGE_API_TOKEN contiene "token_old,token_new"
    When un request usa "token_old"
    Then la respuesta tiene status 200
    When un request usa "token_new"
    Then la respuesta tiene status 200

Feature: Bridge API - Leads

  Scenario: Obtener lista paginada de leads
    Given CRM VENTAS envía GET /bridge/v1/leads?page=1&limit=10
    And el token es válido
    When Dentalogic procesa el request
    Then la respuesta contiene un array "data" con máximo 10 leads
    And la respuesta contiene "pagination" con total y total_pages
    And cada lead incluye id, name, phone, email, source, status, engagement_score

  Scenario: Filtrar leads por estado
    Given CRM VENTAS envía GET /bridge/v1/leads?status=new
    When Dentalogic procesa el request
    Then todos los leads retornados tienen status "new"

  Scenario: Filtrar leads por rango de fechas
    Given CRM VENTAS envía GET /bridge/v1/leads?from_date=2026-03-20&to_date=2026-03-27
    When Dentalogic procesa el request
    Then todos los leads tienen first_seen dentro del rango especificado

  Scenario: Obtener perfil completo de un lead
    Given un lead con id "lead_abc123" existe en Dentalogic
    When CRM VENTAS envía GET /bridge/v1/leads/lead_abc123
    Then la respuesta incluye todos los campos del lead
    And la respuesta incluye un array "events" con el timeline completo
    And cada evento tiene type, data y timestamp

  Scenario: Lead no encontrado
    Given un lead con id "lead_inexistente" no existe
    When CRM VENTAS envía GET /bridge/v1/leads/lead_inexistente
    Then la respuesta tiene status 404
    And el body contiene { "code": "LEAD_NOT_FOUND" }

Feature: Bridge API - Métricas

  Scenario: Obtener resumen de métricas
    Given CRM VENTAS envía GET /bridge/v1/metrics/summary?period=30d
    When Dentalogic procesa el request
    Then la respuesta contiene total_leads, whatsapp_conversations, demo_appointments
    And la respuesta contiene conversion_rate como porcentaje
    And la respuesta contiene top_sources ordenados por count descendente

  Scenario: Obtener datos de embudo
    Given CRM VENTAS envía GET /bridge/v1/metrics/funnel?period=30d
    When Dentalogic procesa el request
    Then la respuesta contiene un array "funnel" con stages ordenados
    And el primer stage "visit" tiene percentage 100
    And cada stage subsiguiente tiene percentage menor o igual al anterior

Feature: Bridge API - Webhooks Bidireccionales

  Scenario: CRM VENTAS actualiza estado de lead
    Given un lead "lead_abc123" tiene status "new" en Dentalogic
    When CRM VENTAS envía POST /bridge/v1/webhooks/lead-update con new_status "contacted"
    Then el lead en Dentalogic se actualiza a status "contacted"
    And la respuesta incluye previous_status y new_status
    And se registra un evento "status_change" en el timeline del lead

  Scenario: Idempotencia en actualización de lead
    Given CRM VENTAS ya envió un lead-update con idempotency_key "upd_xyz789"
    When CRM VENTAS envía el mismo request con la misma idempotency_key
    Then la respuesta tiene status 409
    And el body contiene { "code": "DUPLICATE_REQUEST" }
    And el lead no se modifica nuevamente

  Scenario: Dentalogic envía lead nuevo a CRM VENTAS
    Given un nuevo lead "lead_new456" es detectado en Dentalogic
    And CRM_VENTAS_BRIDGE_URL está configurado
    When el sistema de push se activa
    Then Dentalogic envía POST a {CRM_VENTAS_BRIDGE_URL}/bridge/v1/incoming-lead
    And el body incluye el lead completo con eventos y idempotency_key
    And CRM VENTAS responde con { "received": true, "crm_lead_id": "crm_456" }

Feature: Bridge API - Circuit Breaker

  Scenario: CRM VENTAS no disponible
    Given CRM VENTAS no responde a requests
    When Dentalogic intenta enviar 5 leads consecutivos y todos fallan
    Then el circuit breaker se abre
    And los leads pendientes se almacenan en la cola de reintentos
    And no se envían más requests a CRM VENTAS durante 60 segundos

  Scenario: CRM VENTAS se recupera
    Given el circuit breaker está en estado "open"
    And han pasado 60 segundos
    When el circuit breaker pasa a "half-open"
    And se envía un request de prueba que tiene éxito
    Then el circuit breaker vuelve a estado "closed"
    And los leads en cola se envían con backoff exponencial

  Scenario: Reintentos con backoff exponencial
    Given un lead falló al enviarse a CRM VENTAS
    When el sistema reintenta el envío
    Then el primer reintento ocurre después de 1 minuto
    And el segundo reintento después de 5 minutos
    And el tercer reintento después de 15 minutos
    And después de 5 reintentos fallidos el lead se marca como "failed_delivery"

Feature: Bridge API - Health Check

  Scenario: Health check sin autenticación
    Given cualquier cliente envía GET /bridge/v1/health
    And no se incluye X-Bridge-Token
    When el request es procesado
    Then la respuesta tiene status 200
    And el body contiene { "status": "ok" }

Feature: Bridge API - Audit Log

  Scenario: Registro de llamadas al Bridge API
    Given un request válido a GET /bridge/v1/leads
    When el request es procesado exitosamente
    Then se crea una entrada en el audit log
    And la entrada contiene request_id, timestamp, method, path, source_ip, status_code
    And la entrada contiene token_hash (SHA256 truncado, no el token completo)
```

---

## 10. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/api/bridge/bridgeRouter.ts` | Router Express para `/bridge/v1/*` |
| CREAR | `src/api/bridge/bridgeAuth.middleware.ts` | Middleware de autenticación por token |
| CREAR | `src/api/bridge/bridgeRateLimit.middleware.ts` | Middleware de rate limiting |
| CREAR | `src/api/bridge/bridgeAudit.middleware.ts` | Middleware de audit log |
| CREAR | `src/api/bridge/controllers/leadsController.ts` | Controller para endpoints de leads |
| CREAR | `src/api/bridge/controllers/metricsController.ts` | Controller para endpoints de métricas |
| CREAR | `src/api/bridge/controllers/webhooksController.ts` | Controller para webhooks entrantes |
| CREAR | `src/api/bridge/controllers/healthController.ts` | Controller para health check |
| CREAR | `src/services/bridgePushService.ts` | Servicio para push de leads a CRM VENTAS |
| CREAR | `src/services/circuitBreaker.ts` | Implementación de circuit breaker |
| CREAR | `src/services/bridgeOutbox.ts` | Cola persistente de eventos pendientes |
| CREAR | `src/types/bridge.types.ts` | Tipos TypeScript para el Bridge API |
| MODIFICAR | `src/api/index.ts` | Montar bridgeRouter en el app Express |
| MODIFICAR | `.env.example` | Agregar variables BRIDGE_* y CRM_VENTAS_* |

---

## 11. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Token compartido comprometido | Crítico | Rotación de tokens sin downtime, audit log, IP whitelist opcional |
| CRM VENTAS caído por período extendido | Alto | Circuit breaker + cola persistente con reintentos exponenciales |
| Latencia alta entre VPS | Medio | Timeouts configurables, responses paginados, compresión gzip |
| Datos de leads desincronizados | Medio | Idempotency keys, reconciliación periódica, timestamps de last_sync |
| Rate limit bloquea sincronización legítima | Bajo | Límite configurable vía env var, headers informativos de rate limit |
| IP del VPS cambia tras redeploy | Medio | IP whitelist opcional (no obligatorio), token como auth primario |

---

## 12. Checkpoint de Soberanía

- Cada Dentalogic instance solo expone leads de su propio `tenant_id`
- El `BRIDGE_API_TOKEN` es único por par Dentalogic-CRM VENTAS
- Los audit logs se almacenan asociados al tenant
- La cola de outbox es per-tenant

## 13. Checkpoint de UI

- No aplica directamente (API backend-to-backend)
- Panel de admin puede incluir vista de estado del Bridge en ConfigView:
  - Estado de conexión con CRM VENTAS (last successful sync)
  - Cola de outbox (pendientes / fallidos)
  - Últimos entries del audit log

---

## 14. Clarificaciones Resueltas
- **Red de Confianza**: Se priorizará el token JWT/Bridge.
- **Alertas de Fallos (Outbox)**: Sí, se implementará un sistema de alerta para cuando haya errores enviando leads o la cola se sature.
