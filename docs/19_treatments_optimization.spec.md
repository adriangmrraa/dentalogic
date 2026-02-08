# 📝 Specification: Treatments & Services Optimization

## 1. Contexto y Objetivos
Transformar la página de Tratamientos en una experiencia premium siguiendo el estándar "Sovereign Glass". La interfaz debe ser intuitiva tanto en desktop como en mobile, con alto contraste y una estética minimalista.

### Problemas Detectados
- **Contraste Deficiente**: El botón "Nuevo Servicio" no destaca sobre el fondo.
- **Inputs Genéricos**: Los campos de texto y selectores carecen del estilo refinado de la plataforma.
- **Layout Rígido**: La cuadrícula y la estructura de edición no están optimizadas para mobile.
- **Scroll**: No sigue el patrón de "Scroll Isolation" (usa scroll de body en lugar de contenedor interno).

---

## 2. Requerimientos UI/UX (Sovereign Glass)

### A. Estética Visual
- **Glassmorphism**: Contenedores con transparencia, desenfoque (`backdrop-blur`) y bordes sutiles.
- **Tipografía**: Jerarquía clara con `semibold` para títulos y colores de texto optimizados para legibilidad.
- **Colores**: Uso de la paleta `medical` (azules profundos y esmeraldas) para botones y estados.
- **Micro-interacciones**: Efectos de hover en tarjetas de tratamiento y transiciones suaves al abrir el formulario de creación.

### B. Optimización Móvil
- **Listas Apiladas**: En móvil, los tratamientos se presentan como tarjetas verticales compactas.
- **Drawer/Modal**: El formulario de creación/edición debe comportarse como un drawer inferior o modal centrado en móvil.
- **Bottom Spacing**: Espacio adicional en la parte inferior para evitar que el contenido choque con controles del sistema o barras de navegación.

### C. Funcionalidad de Gestión
- **CRUD Completo**: Permitir Crear, Leer, Actualizar y Eliminar (con confirmación estética).
- **Feedback**: Estados de carga (loading spinners) sutiles y notificaciones toast ante éxitos/errores.

---

## 3. Criterios de Aceptación (Gherkin)

### Escenario: Crear un nuevo servicio con alto contraste
- **Given** que estoy en la vista de Tratamientos.
- **When** observo el botón "Nuevo Servicio".
- **Then** este debe tener un color de fondo `bg-medical-600` o similar que contraste fuertemente con el fondo claro.
- **And** al presionarlo, debe abrirse un formulario con bordes redondeados y campos de estilo minimalista.

### Escenario: Edición fluida en dispositivos táctiles
- **Given** un smartphone con pantalla pequeña.
- **When** toco el botón de editar en un tratamiento.
- **Then** el formulario debe expandirse ocupando el ancho completo de forma estética.
- **And** los inputs deben ser lo suficientemente grandes para ser operados con los dedos.

---

## 4. Plan de Acción (Estructura)

1. **Protocolo UI**: Definir tokens de diseño (Glass, Typography, Borders).
2. **Refactor de Layout**: Aplicar `h-screen overflow-hidden` y `flex-1 min-h-0` para Scroll Isolation.
3. **Componentes de Formulario**: Reemplazar inputs genéricos por Styled Inputs.
4. **Cards de Tratamiento**: Rediseñar las tarjetas de visualización con iconos de categoría y badges de complejidad.
