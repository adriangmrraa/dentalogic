Informe de Refactorización Técnica: Agenda Inteligente 2.0 - Dentalogic

1. Objetivos y Alcance de la Refactorización

El propósito imperativo de la evolución hacia la Agenda 2.0 es la migración total de la infraestructura heredada de Nexus v3 (orientada a E-commerce) hacia la plataforma dental especializada Dentalogic. Esta transición no es simplemente un cambio de interfaz, sino una reingeniería bajo los estándares de "Sovereign Architecture" y "v8.0 DKG Isolation", donde el profesional clínico posee la soberanía absoluta de sus datos mediante una arquitectura multi-tenant rigurosa. El objetivo central es transformar la lógica de "pedidos" en una gestión de turnos inteligente, en tiempo real y con triaje clínico asistido por IA.

2. Arquitectura de Visualización Frontend (FullCalendar)

La visualización se orquesta mediante FullCalendar, optimizada para tres estados de visualización específicos según el dispositivo de acceso.

Matriz de Optimización Responsiva

Dispositivo	Vista Principal	Optimización Técnica Obligatoria
Mobile	Diario (List)	Apilado vertical estricto; eliminación de colisiones visuales para uso en movimiento.
Tablet	Semanal	Vista semanal colapsable con aprovechamiento de gestos táctiles.
Desktop	Sillones / Boxes	Vista detallada por columnas de recursos (boxes), permitiendo gestión multi-profesional simultánea.

Patrón de 'Aislamiento de Scroll' (Overflow Isolation)

Para garantizar una experiencia SaaS fluida, el contenedor Layout.tsx debe implementar una jerarquía de CSS Flexbox que prevenga el scroll global del navegador.

* Implementación: El contenedor raíz debe utilizar h-screen y overflow-hidden.
* Jerarquía de Scroll: Es mandatorio el uso de flex flex-col combinado con la propiedad min-h-0 en los contenedores de las vistas maestras (AgendaView.tsx, ChatsView.tsx). Esto fuerza el aislamiento del scroll únicamente en el área de trabajo de la agenda, manteniendo fijos y accesibles la Sidebar y el Topbar en todo momento.

3. Estandarización de Interfaces de Edición

Los modales de edición deben seguir el patrón de alta densidad de información de la plataforma, garantizando claridad en la gestión de datos sensibles.

* Estructura Interna: Se exige el uso de Acordeones y Tabs para segmentar la anamnesis del paciente, datos de la obra social y detalles técnicos del turno.
* Acciones Persistentes: Es obligatorio el uso de Botones Sticky en la base de los modales para las acciones de guardado y cancelación, independientemente del volumen de datos scrolleables en el modal.
* Estética y Feedback: Se debe mantener la estética Glassmorphism y el uso exclusivo de la librería Lucide Icons.

4. Sistema de Sincronización JIT y Tiempo Real

La Agenda 2.0 implementa la Sincronización Automática JIT (Just-In-Time) v2, eliminando la necesidad de refrescos manuales.

Protocolo JIT en 4 Pasos:

1. Limpieza de Identidad: Normalización mandatoria de nombres. Se deben eliminar prefijos como "Dr." o "Dra." para garantizar el matching exacto con la tabla professionals.
2. Mirroring en Vivo: Consulta asíncrona en tiempo real a la API de Google Calendar.
3. Deduping Inteligente: Filtrado de eventos de GCal que ya existen como registros en la tabla appointments de PostgreSQL.
4. Cálculo de Huecos: Cruce final de disponibilidad local vs. bloqueos externos.

Comunicación Socket.IO

El frontend debe conectarse al namespace / de Socket.IO y escuchar estrictamente los eventos:

* NEW_APPOINTMENT: Inserción inmediata en el calendario.
* APPOINTMENT_UPDATED: Refresco de estados o reasignación de boxes.

Al montar AgendaView.tsx, el sistema debe ejecutar una sincronización en background mostrando un indicador de "Sincronizando..." no intrusivo en la UI.

5. Evolución del Backend (FastAPI) y Persistencia

El servicio orchestrator_service se redefine para manejar cargas incrementales y persistencia atómica.

* Consultas SQL de Alto Rendimiento: Para soportar la carga dinámica de la agenda, se exige el uso de parámetros de paginación en las consultas SQL: LIMIT $2 OFFSET $3. Esto es crítico para la carga bajo demanda de citas y mensajes.
* Persistencia de Drag & Drop: Cada cambio de posición en la UI debe disparar una actualización síncrona en PostgreSQL y Google Calendar. Si la sincronización externa falla, la transacción local debe revertirse (Atomicidad).
* Protocolo de Evolución de DB: El Maintenance Robot en db.py debe ser invocado exclusivamente durante el evento lifespan de FastAPI. Los parches de base de datos deben usar bloques DO $$ para garantizar migraciones idempotentes de las tablas appointments y professionals.
* Omega Protocol Prime: Se debe asegurar la activación automática del primer usuario con rol ceo registrado para prevenir bloqueos de acceso durante la fase de despliegue inicial.

6. Arquitectura 'Sovereign' y Multi-tenancy

El aislamiento de datos es la piedra angular de Dentalogic.

* Validación de Tenencia: Toda operación (lectura o escritura) en la agenda debe incluir estrictamente el tenant_id extraído del token JWT. Se prohíbe cualquier consulta que no filtre explícitamente por este identificador.
* Bóveda de Credenciales: Es mandatorio el uso de la Bóveda de Credenciales gestionada vía admin/internal/credentials para almacenar tokens de Google Calendar.
* Prohibiciones Estrictas: Se prohíbe explícitamente el uso de variables de entorno globales para credenciales de clientes. Se advierte contra el "Vibe Coding": cualquier intento de hardcodear lógica de autenticación o credenciales fuera del flujo oficial del Orchestrator será rechazado en la auditoría.

7. Checklist de Validación de Refactorización

Para el cierre del hito de refactorización, se deben validar los siguientes puntos:

* [ ] Optimización responsiva: Verificación de vista diaria en mobile y boxes en desktop.
* [ ] Sincronización JIT: Los eventos creados en Google Calendar aparecen en la agenda sin intervención manual.
* [ ] Persistencia Drag & Drop: Movimientos en la UI se reflejan correctamente en PGSQL y GCal.
* [ ] Aislamiento de Scroll: Implementación correcta de min-h-0 en AgendaView.tsx y Layout.tsx.
* [ ] Triaje de Urgencias: Los turnos con triage_urgency en nivel high o emergency deben presentar alertas visuales rojas y prioridad de posicionamiento en la vista de lista.
* [ ] SQL Check: Verificación de parámetros LIMIT y OFFSET en todos los endpoints de listado.
* [ ] Sovereign Check: Confirmación de que el tenant_id se propaga en todas las llamadas al gcal_service.


--------------------------------------------------------------------------------


Dentalogic © 2026
