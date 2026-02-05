# 📖 Guía Simple: ¿Cómo funciona Dentalogic?

Este documento explica de forma sencilla, sin tecnicismos, qué hace este sistema y cómo ayuda a que la clínica funcione mejor.

---

## 1. El Concepto: Mercedes, la Secretaria Virtual
Imagina que **Mercedes** es una secretaria muy eficiente que nunca duerme. Ella atiende el WhatsApp de la clínica, responde dudas de los pacientes y anota los turnos. Pero no es solo un bot que repite opciones; ella "entiende" lo que le dicen, ya sea por texto o por audio.

## 2. El "Cerebro" y el "Tablero de Control"
Para que todo funcione, el sistema se divide en dos partes que se hablan todo el tiempo:

*   **El Cerebro (Backend):** Es donde vive Mercedes. Ella recibe los mensajes, consulta la agenda y decide qué responder.
*   **El Tablero (Frontend):** Es la pantalla que ven los odontólogos y secretarias en la clínica. Aquí está la agenda visual, las fichas de los pacientes y las alertas.

**¿Cómo se hablan?**
Si un paciente agenda un turno por WhatsApp con Mercedes, Mercedes envía una señal instantánea al Tablero. En menos de un segundo, el turno aparece dibujado en la agenda de la clínica sin que nadie tenga que apretar "Refrescar". Es una conversación en tiempo real.

## 3. Las Herramientas de Mercedes (IA)
Mercedes tiene "superpoderes" llamados herramientas (tools) que usa según lo que necesite el paciente:

1.  **Consultar Disponibilidad:** Cuando alguien pregunta "¿Tenés turno para mañana?", Mercedes mira la agenda real de los doctores y le dice al paciente exactamente qué horarios están libres.
2.  **Anotar Turno:** Una vez que el paciente elige una hora, Mercedes lo anota oficialmente. Esto crea el registro en la base de datos y lo muestra en el calendario de la clínica.
3.  **Triaje (Clasificación de Urgencia):** Si un paciente dice "Me duele mucho" o "Se me rompió un diente", Mercedes analiza la gravedad.
    *   **Cómo se muestra:** En el Tablero de la clínica, Mercedes pone un aviso de "Urgencia" resaltado para que el personal sepa que debe darle prioridad a ese mensaje.

## 4. El Trabajo en Equipo: Frontend, Base de Datos y Mercedes
Todos los componentes trabajan juntos para que no se pierda ninguna información:

*   **La Base de Datos (La Memoria):** Aquí se guarda todo. Mercedes recuerda si un paciente es alérgico a la penicilina o si hace mucho que no viene. 
*   **Historias Clínicas Inteligentes:** Cuando Mercedes charla con un paciente, ella "anota" en su memoria los síntomas que el paciente mencionó. Luego, cuando el doctor abre la ficha del paciente en el **Frontend**, ya puede ver un resumen de lo que el paciente le contó a la IA antes de entrar al consultorio.
*   **Detección de Alertas:** Si el doctor anota que un paciente es diabético en el Frontend, la próxima vez que ese paciente hable con Mercedes, ella lo sabrá y podrá ser más cuidadosa o dar avisos específicos.

## 5. El "Freno de Mano" Humano
Si Mercedes no entiende algo o si el paciente pide hablar con una persona, Mercedes se retira (se "silencia" por 24 horas). En el Tablero de la clínica, aparece un aviso indicando que ese paciente necesita atención humana. Una vez que la secretaria de la clínica responde manualmente, Mercedes se queda tranquila esperando hasta que se le pida volver a intervenir.

---
*En resumen: Dentalogic es Mercedes atendiendo el WhatsApp y un panel inteligente para que los doctores tengan todo bajo control en tiempo real.*
