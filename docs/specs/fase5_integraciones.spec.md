# SPEC: Integraciones (Meta + Google)

**Fase:** 5 - Integraciones
**Prioridad:** MEDIA-ALTA
**Bloqueado por:** Fase 4 (Marketing Hub)
**Origen:** Replicación de ClinicForge
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

ClinicForge tiene wizards de conexión para Meta (Facebook/Instagram/WhatsApp Business) y Google Ads, banners de estado de conexión, y hooks dedicados para los SDKs. Esta fase implementa toda la capa de integración con plataformas externas.

---

## 2. Requerimientos Técnicos

### 2.1 MetaConnectionWizard (`src/components/integrations/MetaConnectionWizard.tsx`)

**Descripción:** Wizard paso a paso para conectar la cuenta de Facebook Business del usuario.

**Steps:**
1. **Bienvenida**: Explicación de qué se va a conectar y beneficios
2. **Login con Facebook**: Botón de FB Login usando Facebook SDK
3. **Seleccionar Página**: Lista de páginas de Facebook disponibles
4. **Conectar WhatsApp**: Seleccionar número de WhatsApp Business
5. **Conectar Instagram** (opcional): Vincular cuenta de Instagram
6. **Confirmación**: Resumen de conexiones establecidas

**Props:**
```typescript
interface MetaConnectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (connections: MetaConnections) => void;
}

interface MetaConnections {
  facebookPageId?: string;
  facebookPageName?: string;
  whatsappBusinessId?: string;
  whatsappPhoneNumber?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  accessToken: string;
}
```

**UI:**
- Modal full-screen en mobile, centered modal en desktop
- Cada step en GlassCard con transición `cardSlideLeft`
- Progress bar arriba mostrando step actual
- Botones Next/Back con validación por step
- Animación de éxito en step final

**API Endpoints:**
```
POST /admin/integrations/meta/connect     → MetaConnection
GET  /admin/integrations/meta/pages       → FacebookPage[]
GET  /admin/integrations/meta/whatsapp    → WhatsAppAccount[]
GET  /admin/integrations/meta/instagram   → InstagramAccount[]
GET  /admin/integrations/meta/status      → ConnectionStatus
POST /admin/integrations/meta/disconnect  → void
```

### 2.2 GoogleConnectionWizard (`src/components/integrations/GoogleConnectionWizard.tsx`)

**Descripción:** Wizard para conectar Google Ads y autorizar acceso a campañas.

**Steps:**
1. **Bienvenida**: Beneficios de conectar Google Ads
2. **Autorizar Google**: OAuth2 redirect flow
3. **Seleccionar Cuenta**: Lista de cuentas de Google Ads disponibles
4. **Confirmación**: Resumen y sync inicial de campañas

**Props:**
```typescript
interface GoogleConnectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (connection: GoogleConnection) => void;
}

interface GoogleConnection {
  customerId: string;
  customerName: string;
  email: string;
}
```

**API Endpoints:**
```
GET  /admin/auth/google/ads/url          → { authUrl: string }
POST /admin/auth/google/ads/callback     → GoogleConnection
GET  /admin/auth/google/ads/customers    → GoogleCustomer[]
GET  /admin/auth/google/ads/status       → ConnectionStatus
POST /admin/auth/google/ads/disconnect   → void
```

### 2.3 LeadsFormsTab (`src/components/integrations/LeadsFormsTab.tsx`)

**Descripción:** Tab dentro de ConfigView para configurar Meta Lead Forms (formularios de captación de leads desde anuncios de Facebook/Instagram).

**Funcionalidad:**
- Lista de Lead Forms disponibles de Meta
- Toggle para activar/desactivar cada form
- Mapeo de campos: Meta form field → campo de lead en Dentalogic
- Webhook URL para recibir leads en tiempo real
- Test de webhook

**Props:**
```typescript
interface LeadsFormsTabProps {
  tenantId: string;
}
```

**API Endpoints:**
```
GET  /admin/integrations/meta/lead-forms        → LeadForm[]
PUT  /admin/integrations/meta/lead-forms/{id}    → LeadForm
GET  /admin/integrations/meta/lead-forms/webhook → WebhookConfig
POST /admin/integrations/meta/lead-forms/test    → TestResult
```

### 2.4 MetaTokenBanner (`src/components/MetaTokenBanner.tsx`)

**Descripción:** Banner que aparece en el Layout cuando el token de Meta está próximo a expirar o ya expiró.

**Props:**
```typescript
interface MetaTokenBannerProps {
  status: 'valid' | 'expiring_soon' | 'expired' | 'not_connected';
  expiresAt?: string;
  onReconnect: () => void;
}
```

**Estados visuales:**
- `valid`: No mostrar banner
- `expiring_soon`: Banner amber con "Tu conexión con Meta expira en X días. Reconectar"
- `expired`: Banner danger con "Conexión con Meta expirada. Reconectar ahora"
- `not_connected`: Banner info con "Conecta Meta para recibir leads automáticamente"

**UI:**
- Sticky top, debajo del header
- GlassCard estrecho con borde de color semántico
- Botón de acción abre MetaConnectionWizard
- Dismiss temporal (per session)

### 2.5 MetaConnectionTab (`src/components/integrations/MetaConnectionTab.tsx`)

**Descripción:** Tab dentro de ConfigView con estado de conexiones Meta y acciones.

**Secciones:**
- Estado de Facebook Page (connected/disconnected)
- Estado de WhatsApp Business (connected/disconnected)
- Estado de Instagram (connected/disconnected)
- Token status con fecha de expiración
- Botones: Reconectar, Desconectar, Abrir Wizard

### 2.6 useFacebookSdk Hook (`src/hooks/useFacebookSdk.ts`)

**Descripción:** Hook que inicializa el Facebook JavaScript SDK.

```typescript
interface UseFacebookSdkReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<FB.AuthResponse>;
  getLoginStatus: () => Promise<FB.LoginStatus>;
}

export function useFacebookSdk(appId: string): UseFacebookSdkReturn;
```

**Implementación:**
- Carga script de Facebook SDK asíncronamente
- Inicializa con `FB.init({ appId, version: 'v18.0' })`
- Expone `FB.login()` wrapeado en Promise
- Maneja errores de carga del SDK
- Cleanup en unmount

### 2.7 useSmartScroll Hook (`src/hooks/useSmartScroll.ts`)

**Descripción:** Hook para detectar dirección de scroll y auto-hide de headers/elements.

```typescript
interface UseSmartScrollReturn {
  scrollDirection: 'up' | 'down' | null;
  isScrolled: boolean;      // true si scrollY > threshold
  scrollY: number;
  isAtBottom: boolean;
}

export function useSmartScroll(threshold?: number): UseSmartScrollReturn;
```

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Meta Connection Wizard

  Scenario: Conectar Facebook exitosamente
    Given la configuración abierta
    When hago click en "Conectar Meta"
    Then se abre el wizard en step 1
    When completo el login de Facebook
    Then paso al step 3 y veo mis páginas disponibles
    When selecciono una página y confirmo
    Then la conexión se establece y el wizard cierra

  Scenario: Banner de token expirado
    Given un token de Meta expirado
    When la app carga
    Then veo banner rojo "Conexión con Meta expirada"
    When hago click en "Reconectar"
    Then se abre el MetaConnectionWizard

Feature: Google Ads Connection

  Scenario: Conectar Google Ads
    Given la configuración abierta
    When hago click en "Conectar Google Ads"
    Then se abre el wizard
    When autorizo con Google OAuth
    Then veo mis cuentas de Google Ads
    When selecciono una cuenta
    Then se inicia sync de campañas

Feature: Facebook SDK Hook

  Scenario: SDK cargado correctamente
    Given el componente que usa useFacebookSdk
    When el componente se monta
    Then isLoading es true inicialmente
    And cuando el script carga, isLoaded es true
    And login() está disponible para usar
```

---

## 4. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/components/integrations/MetaConnectionWizard.tsx` | Wizard de Meta |
| CREAR | `src/components/integrations/MetaConnectionTab.tsx` | Tab de estado Meta |
| CREAR | `src/components/integrations/GoogleConnectionWizard.tsx` | Wizard de Google |
| CREAR | `src/components/integrations/LeadsFormsTab.tsx` | Config de Lead Forms |
| CREAR | `src/components/MetaTokenBanner.tsx` | Banner de token Meta |
| CREAR | `src/hooks/useFacebookSdk.ts` | Hook de Facebook SDK |
| CREAR | `src/hooks/useSmartScroll.ts` | Hook de smart scroll |
| MODIFICAR | `src/components/Layout.tsx` | Integrar MetaTokenBanner |
| MODIFICAR | `src/views/ConfigView.tsx` | Agregar tabs de integraciones |
| MODIFICAR | `package.json` | Agregar `dompurify` como dependencia |

---

## 5. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Facebook SDK no carga (bloqueo de país/red) | Alto | Timeout de 10s + fallback UI sin SDK |
| OAuth redirect pierde estado | Medio | State parameter en URL + sessionStorage |
| Token de Meta expira sin aviso | Medio | Cron check cada 24h + banner proactivo |
| Google OAuth scopes rechazados | Medio | Explicar permisos requeridos en wizard step 1 |

---

## 6. Checkpoint de Soberanía
- Tokens de Meta/Google almacenados asociados al `tenant_id`
- Desconexión elimina tokens del tenant específico
- Lead Forms webhook valida `tenant_id` en payload

## 7. Checkpoint de UI
- Wizards: modal con steps en GlassCard, transiciones cardSlide
- Banner: GlassCard sticky con colores semánticos
- Tabs de configuración: consistent con el design system premium
