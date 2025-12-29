# 🤖 Master Prompt Template para IAs (Nexus v3)

Copia y pega este prompt cuando necesites que otra IA (como Claude, GPT o Cursor) realice cambios, agregue funciones o corrija errores en este proyecto. Está diseñado para darle todo el contexto crítico de entrada.

---

## Copiar desde aquí:

**OBJETIVO:** [DESCRIBE AQUÍ QUÉ QUIERES HACER, EJ: "Agregar una tool de stock" o "Corregir el formato de precios"]

### 🏗️ Contexto del Proyecto (Arquitectura Nexus v3)
Estás trabajando en un sistema de microservicios para un Agente de Ventas de WhatsApp (Tienda Nube + YCloud + LangChain).
- **orchestrator_service:** El cerebro. Contiene el agente de IA y las herramietas embebidas (API Tienda Nube).
- **whatsapp_service:** Maneja webhooks, transcripción de audio (Whisper) y entrega de mensajes.
- **Base de Datos:** PostgreSQL (persistente) y Redis (memoria volátil/locks).

### 📜 Reglas de Oro y Persona
- **Persona:** El agente es una vendedora de danza experta argentina ("Argentina Buena Onda"). Usa "vos", es cálida, informal pero profesional.
- **Regla de Envíos:** Prohibido dar costos o tiempos. Siempre decir: "Se calcula al final de la compra". Puede mencionar partners de `{SHIPPING_PARTNERS}`.
- **Regla de Catálogo:** Jamás inventar productos. Si no hay tool, no hay productos.
- **Formato WhatsApp:** Prohibido usar Markdown (`**`, `###`, etc.). Los mensajes deben ser texto plano limpio.

### 📁 Archivos de Referencia Críticos
Antes de proponer cambios, analiza estos archivos:
1. `orchestrator_service/main.py`: Lógica central del agente y System Prompt.
2. `whatsapp_service/main.py`: Lógica de transmición y manejo de audios/imágenes.
3. `AGENTS.md`: Guía técnica para evitar errores comunes (Pydantic, NameErrors, etc.).

### 🛠️ Tareas Específicas:
[LISTA DETALLADA DE LO QUE NECESITAS AQUÍ]
1. ...
2. ...

### 🚩 Restricciones Técnicas:
- No rompas la lógica de multi-tenant (siempre usar variables de entorno o `tenant_id`).
- Asegúrate de que todas las funciones nuevas sean `asincrónicas`.
- Si modificas el Prompt, respeta la numeración de las reglas (1 al 6).

---
**¿Entendido? Por favor, analiza la estructura actual y proponé el plan de implementación.**
