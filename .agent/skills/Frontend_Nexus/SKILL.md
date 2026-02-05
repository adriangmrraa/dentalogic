---
name: "Nexus UI Developer"
description: "Especialista en React 18, TypeScript, Tailwind CSS y conexión con API multi-tenant."
trigger: "frontend, react, tsx, componentes, UI, vistas, hooks"
scope: "FRONTEND"
auto-invoke: true
---

# Nexus UI Developer - Dentalogic

# Nexus UI Developer - Dentalogic

## 1. Arquitectura Frontend
El frontend en `frontend_react/` es una SPA moderna basada en:
- **React 18** + TypeScript + Vite.
- **TailwindCSS** para el layout y **Vanilla CSS** para el diseño premium (Glassmorphism).
- **Lucide Icons** para la iconografía dental.
- **Axios**: Cliente HTTP configurado en `src/api/axios.ts`.

## 2. API Communication Protocol
**REGLA DE ORO**: Todas las llamadas al backend administrativo **DEBEN** incluir el header `X-Admin-Token`.

### Hook `useApi`:
Utiliza el hook personalizado para manejar estados de carga y errores de forma estandarizada.

### Cliente Axios (`src/api/axios.ts`):
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'X-Admin-Token': localStorage.getItem('admin_token')
  }
});
```

## 3. Vistas Críticas (Business Logic)

### AgendaView.tsx
- La pieza central de Dentalogic.
- Muestra turnos desde la BD y bloqueos de Google Calendar.
- Permite agendar "Sobreturnos" forzados.

### DashboardView.tsx (Triage Center)
- Escucha eventos de Socket.IO (`HIGH_URGENCY_TRIAGE`, `CRITICAL_TRIAGE`).
- Muestra métricas de hoy: Turnos, Pendientes, Urgencias.
- Controla el estado global del Bot IA.

### Credentials.tsx (The Vault UI)
- Gestión de `GOOGLE_CREDENTIALS` y `YCLOUD_API_KEY`.
- Muestra la URL dinámica para el Webhook de YCloud con opción de copiado.

## 4. Estilos y UX (Premium Dental)
- **Glassmorphism**: Usar clase `.glass` para tarjetas e inputs.
- **Micro-animaciones**: Usar `animate-pulse` para estados de triaje crítico.
- **Responsive**: Mobile-first para que los odontólogos puedan ver su agenda desde el celular.

## 5. Checklist de UI
- [ ] ¿El componente maneja `isLoading` con un spinner o esqueleto?
- [ ] ¿Los errores se muestran vía Toasts o alertas `check-fail`?
- [ ] ¿Se usa `Lucide` para coherencia visual?
- [ ] ¿La tabla/lista tiene `key` único (IDs de la BD)?
