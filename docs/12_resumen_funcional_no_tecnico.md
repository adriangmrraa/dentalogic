# 📖 Guía Simple: ¿Cómo funciona Dentalogic?

Este documento explica de forma sencilla, sin tecnicismos, qué hace este sistema y cómo ayuda a que la clínica funcione mejor.

---

## 1. El Concepto: La Asistente Virtual de la Dra. Laura
Imagina que tenés una secretaria muy eficiente que nunca duerme. Ella atiende el WhatsApp de la clínica, responde dudas de los pacientes y anota los turnos. Pero no es solo un bot que repite opciones; ella "entiende" lo que le dicen, ya sea por texto o por audio, usando un tono cálido y natural.

## 2. El "Cerebro" y el "Dashboard Inteligente"
Para que todo funcione, el sistema se divide en dos partes que se hablan todo el tiempo:

*   **El Cerebro (Backend):** Es donde vive la IA. Recibe los mensajes, consulta la agenda y decide qué responder siguiendo las reglas de la Dra. Laura.
*   **El Tablero (Dashboard):** Es la pantalla que ven los odontólogos y secretarias. Aquí están los chats, la agenda visual y las alertas.

**¿Cómo se hablan?**
Si un paciente agenda un turno por WhatsApp con la asistente, la IA envía una señal instantánea al Tablero. En menos de un segundo, el turno aparece dibujado en la agenda de la clínica sin que nadie tenga que apretar "Refrescar". Es una conversación en tiempo real.

 La IA tiene "superpoderes" llamados herramientas (tools) que usa según lo que necesite el paciente:

1.  **Agenda Inteligente:** Cuando alguien pregunta "¿Tenés turno para mañana?", la IA mira la agenda real y ofrece los huecos libres.
2.  **Anotar Turno:** Una vez que el paciente elige, la IA lo anota oficialmente y aparece al instante en el calendario de la clínica.
3.  **Triaje de Urgencias:** Si un paciente dice "Me duele mucho", la IA detecta la gravedad y marca el chat con un aviso de "Urgencia" resaltado. Además, el sistema ordena las conversaciones automáticamente, poniendo los mensajes más recientes o urgentes arriba de todo.

## 4. El Trabajo en Equipo: Frontend, Base de Datos y la IA
Todos los componentes trabajan juntos para que no se pierda ninguna información:

*   **La Base de Datos (La Memoria):** Aquí se guarda todo. La IA recuerda si un paciente es alérgico a la penicilina o si hace mucho que no viene. 
*   **Historias Clínicas Inteligentes:** Cuando la asistente charla con un paciente, ella "anota" en su memoria los síntomas que el paciente mencionó. Luego, cuando el doctor abre la ficha del paciente en el **Frontend**, ya puede ver un resumen de lo que el paciente le contó a la IA antes de entrar al consultorio.
*   **Detección de Alertas:** Si el doctor anota que un paciente es diabético en el Frontend, la próxima vez que ese paciente hable con la IA, ella lo sabrá y podrá ser más cuidadosa o dar avisos específicos.

## 5. El "Control Humano" y la Ventana de 24hs
Si la IA no entiende algo o si el paciente pide hablar con una persona, la IA se retira (se "silencia"). 

*   **Intervención Humana:** Aparece un aviso indicando que ese paciente necesita atención manual. Una vez que el personal responde, la IA se queda esperando hasta que se le pida volver a intervenir.
*   **Regla de WhatsApp (24hs):** Por seguridad y política de WhatsApp, los mensajes manuales solo pueden enviarse si el paciente escribió en las últimas 24 horas. El sistema te avisará con un banner si la ventana se cerró, para evitar que WhatsApp bloquee la línea por spam.

---
*En resumen: Dentalogic es tu asistente inteligente atendiendo el WhatsApp y un panel organizado en tiempo real para que tu clínica nunca pierda un paciente.*
