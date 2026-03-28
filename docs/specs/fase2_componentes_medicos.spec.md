# SPEC: Componentes Médicos Dentales

**Fase:** 2 - Componentes Core
**Prioridad:** ALTA
**Bloqueado por:** Fase 1 (Design System Premium)
**Origen:** Replicación de ClinicForge
**Fecha:** 2026-03-27

---

## 1. Contexto y Objetivos

ClinicForge tiene componentes médicos especializados que Dentalogic no posee: Odontograma interactivo, panel de anamnesis, galería de documentos y manejo de media en chat. Estos componentes son esenciales para una clínica dental y deben implementarse con el design system premium de la Fase 1.

---

## 2. Requerimientos Técnicos

### 2.1 Odontogram Component (`src/components/Odontogram.tsx`)

**Descripción:** Diagrama dental interactivo que permite seleccionar dientes y registrar estados/tratamientos por pieza.

**Props:**
```typescript
interface OdontogramProps {
  patientId: string;
  teeth: ToothRecord[];
  onToothSelect: (toothNumber: number) => void;
  onToothUpdate: (toothNumber: number, status: ToothStatus) => void;
  readOnly?: boolean;
}

interface ToothRecord {
  number: number;          // 11-48 (notación FDI)
  status: ToothStatus;
  notes?: string;
  treatments?: string[];
  lastUpdated?: string;
}

type ToothStatus = 'healthy' | 'cavity' | 'filled' | 'crown' | 'extraction' | 'implant' | 'bridge' | 'root_canal' | 'pending';
```

**Layout visual:**
- Disposición anatómica: maxilar superior (18-11, 21-28) e inferior (48-41, 31-38)
- Cada diente es un SVG/div clickeable con color según estado
- Al seleccionar: animación `toothPop` (0.4s bounce)
- Diente seleccionado: círculo dashed rotando (8s infinite `orbit`)
- Colores por estado:
  - healthy: `text-emerald-400`
  - cavity: `text-red-400`
  - filled: `text-blue-400`
  - crown: `text-yellow-400`
  - extraction: `text-gray-500` (tachado)
  - implant: `text-violet-400`
  - bridge: `text-amber-400`
  - root_canal: `text-orange-400`
  - pending: `text-white/30`

**Panel lateral (al seleccionar diente):**
- Número y nombre del diente
- Estado actual (dropdown)
- Notas (textarea glass)
- Historial de tratamientos
- Botón guardar con `pulseGlow` cuando hay cambios

**API Endpoints:**
```
GET    /admin/patients/{id}/odontogram        → ToothRecord[]
PUT    /admin/patients/{id}/odontogram/{tooth} → ToothRecord
```

### 2.2 AnamnesisPanel Component (`src/components/AnamnesisPanel.tsx`)

**Descripción:** Panel de historia clínica / anamnesis del paciente con secciones colapsables.

**Props:**
```typescript
interface AnamnesisPanelProps {
  patientId: string;
  anamnesis: AnamnesisData;
  onSave: (data: AnamnesisData) => void;
  readOnly?: boolean;
}

interface AnamnesisData {
  personalHistory: {
    allergies: string[];
    medications: string[];
    chronicConditions: string[];
    surgeries: string[];
    pregnancyStatus?: 'none' | 'pregnant' | 'lactating';
  };
  dentalHistory: {
    lastVisit?: string;
    brushingFrequency: string;
    flossing: boolean;
    sensitivity: string[];
    bruxism: boolean;
    previousTreatments: string[];
  };
  habits: {
    smoking: boolean;
    alcohol: boolean;
    diet: string;
  };
  observations: string;
  consentSigned: boolean;
  consentDate?: string;
  lastUpdated: string;
  updatedBy: string;
}
```

**Layout:**
- Secciones colapsables con animación `slideUp`
- Cada sección es un GlassCard
- Campos tipo checkbox, text, select con styling glass
- Badge de última actualización
- Botón de guardar con confirmación

**API Endpoints:**
```
GET    /admin/patients/{id}/anamnesis  → AnamnesisData
PUT    /admin/patients/{id}/anamnesis  → AnamnesisData
```

### 2.3 DocumentGallery Component (`src/components/DocumentGallery.tsx`)

**Descripción:** Galería de documentos e imágenes médicas del paciente (radiografías, fotos intraorales, consentimientos).

**Props:**
```typescript
interface DocumentGalleryProps {
  patientId: string;
  documents: PatientDocument[];
  onUpload: (files: File[]) => void;
  onDelete: (docId: string) => void;
  onView: (doc: PatientDocument) => void;
}

interface PatientDocument {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'xray' | 'consent' | 'other';
  url: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  category: string;
  size: number;
}
```

**Layout:**
- Grid de thumbnails (3 columnas desktop, 2 mobile)
- Cada thumbnail es un GlassCard miniatura
- Click abre lightbox/modal con imagen completa
- Drag & drop upload zone con animación `fadeIn`
- Filtro por tipo de documento (tabs)
- Badge de categoría por documento

**API Endpoints:**
```
GET    /admin/patients/{id}/documents           → PatientDocument[]
POST   /admin/patients/{id}/documents/upload     → PatientDocument (multipart)
DELETE /admin/patients/{id}/documents/{docId}    → void
```

### 2.4 MessageMedia Component (`src/components/chat/MessageMedia.tsx`)

**Descripción:** Componente para renderizar media en mensajes de chat (imágenes, audio, video, documentos).

**Props:**
```typescript
interface MessageMediaProps {
  media: ChatMedia;
  onView?: (media: ChatMedia) => void;
}

interface ChatMedia {
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  url: string;
  mimeType: string;
  filename?: string;
  caption?: string;
  duration?: number;     // audio/video en segundos
  thumbnail?: string;
}
```

**Renderizado por tipo:**
- **image**: Thumbnail clickeable → lightbox, caption abajo
- **audio**: Player inline con waveform visual, duración
- **video**: Thumbnail con play icon overlay → player modal
- **document**: Icono de archivo + nombre + tamaño + botón download
- **sticker**: Imagen sin borde con fondo transparente

---

## 3. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Odontograma Interactivo

  Scenario: Visualizar odontograma del paciente
    Given un paciente con registros dentales
    When abro la pestaña de odontograma en PatientDetail
    Then veo 32 dientes organizados por maxilar superior e inferior
    And cada diente muestra su color según estado actual

  Scenario: Seleccionar y actualizar diente
    Given el odontograma visible
    When hago click en el diente 21
    Then el diente muestra animación toothPop
    And aparece panel lateral con datos del diente 21
    When cambio el estado a "cavity"
    And hago click en guardar
    Then el diente 21 cambia a color rojo (text-red-400)
    And se envía PUT a /admin/patients/{id}/odontogram/21

Feature: Panel de Anamnesis

  Scenario: Ver anamnesis completa
    Given un paciente con anamnesis registrada
    When abro la pestaña de anamnesis
    Then veo secciones colapsables: Historia Personal, Historia Dental, Hábitos, Observaciones
    And cada sección muestra los datos correctos

  Scenario: Editar anamnesis
    Given la anamnesis en modo edición
    When modifico "allergies" agregando "Penicilina"
    And hago click en guardar
    Then se envía PUT con los datos actualizados
    And el badge de última actualización cambia

Feature: Galería de Documentos

  Scenario: Subir documento
    Given la galería de documentos abierta
    When hago drag & drop de una imagen de radiografía
    Then aparece preview con animación fadeIn
    And se sube via POST multipart
    And aparece en la galería como thumbnail

  Scenario: Ver documento en lightbox
    Given un documento tipo imagen en la galería
    When hago click en el thumbnail
    Then se abre un modal lightbox con la imagen completa
    And puedo navegar con flechas entre documentos

Feature: Media en Chat

  Scenario: Renderizar imagen en chat
    Given un mensaje con media tipo "image"
    When el mensaje se renderiza
    Then muestra thumbnail de la imagen
    And al hacer click abre lightbox

  Scenario: Renderizar audio en chat
    Given un mensaje con media tipo "audio"
    When el mensaje se renderiza
    Then muestra player inline con botón play y duración
```

---

## 4. Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| CREAR | `src/components/Odontogram.tsx` | Odontograma interactivo |
| CREAR | `src/components/AnamnesisPanel.tsx` | Panel de anamnesis |
| CREAR | `src/components/DocumentGallery.tsx` | Galería de documentos |
| CREAR | `src/components/chat/MessageMedia.tsx` | Media handler para chat |
| MODIFICAR | `src/views/PatientDetail.tsx` | Integrar tabs con Odontogram, Anamnesis, Documents |
| MODIFICAR | `src/views/ChatsView.tsx` | Integrar MessageMedia en renderizado de mensajes |

---

## 5. Esquema de Datos (Backend - referencia)

```sql
-- Odontograma
CREATE TABLE IF NOT EXISTS patient_odontogram (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  tooth_number INTEGER NOT NULL CHECK (tooth_number BETWEEN 11 AND 48),
  status VARCHAR(20) NOT NULL DEFAULT 'healthy',
  notes TEXT,
  treatments JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id),
  UNIQUE(tenant_id, patient_id, tooth_number)
);

-- Anamnesis
CREATE TABLE IF NOT EXISTS patient_anamnesis (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  data JSONB NOT NULL DEFAULT '{}',
  consent_signed BOOLEAN DEFAULT FALSE,
  consent_date TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id),
  UNIQUE(tenant_id, patient_id)
);

-- Documentos
CREATE TABLE IF NOT EXISTS patient_documents (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  category VARCHAR(50),
  size INTEGER,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by INTEGER REFERENCES users(id)
);
```

---

## 6. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Odontograma SVG complejo de renderizar en mobile | Medio | Usar divs simples con CSS grid, no SVG pesado |
| Upload de archivos grandes | Medio | Limitar a 10MB, comprimir imágenes client-side |
| Lightbox bloqueando scroll | Bajo | Modal con `overflow-hidden` en body, restore al cerrar |

---

## 7. Checkpoint de Soberanía
- TODAS las queries de odontograma, anamnesis y documentos DEBEN filtrar por `tenant_id`
- `tenant_id` se extrae de JWT, NUNCA de URL params

## 8. Checkpoint de UI
- Todos los componentes usan GlassCard como superficie base
- Animaciones: `toothPop` para dientes, `slideUp` para secciones, `fadeIn` para uploads
- Scroll Isolation respetado en paneles con contenido largo
