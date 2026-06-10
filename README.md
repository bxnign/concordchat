# ConcordChat

Plataforma de Inbox Unificado de mensajería construida desde cero, controlada al 100% por el usuario. Centraliza los chats de Instagram (Messenger API) y WhatsApp (WhatsApp Cloud API) en una sola interfaz en tiempo real, sin depender de intermediarios no-code ni plataformas de terceros.

---

## Descripción general

ConcordChat actúa como un backend propio que recibe los webhooks oficiales de Meta, los valida, normaliza su estructura a un modelo unificado e interno, y los distribuye en tiempo real mediante WebSockets hacia el cliente. El resultado es una bandeja de entrada única que unifica conversaciones de distintos canales con control total sobre los datos y la lógica.

---

## Stack tecnológico

- **Backend:** Node.js con TypeScript
- **Framework HTTP:** Fastify
- **WebSockets:** ws (librería nativa)
- **Base de datos:** PostgreSQL
- **ORM:** Prisma
- **Infraestructura local de desarrollo:** ngrok (para exponer webhooks durante el desarrollo)
- **Variables de entorno:** dotenv

---

## Plan de acción por fases

### Fase 0 — Configuración inicial del entorno

El objetivo de esta fase es tener el proyecto levantado localmente con la estructura base lista para construir sobre ella.

**Pasos:**
- Definir e inicializar la estructura de carpetas del proyecto.
- Configurar TypeScript, ESLint y el entorno de ejecución con ts-node o tsx.
- Crear el archivo `.env` con las variables necesarias (tokens, secrets, URLs).
- Instalar las dependencias base del proyecto.
- Validar que el servidor arranca correctamente con un endpoint de health check.

**Entregable:** Servidor HTTP funcional en local con estructura de carpetas establecida.

---

### Fase 1 — Configuración en Meta for Developers

El objetivo es tener las dos integraciones activas (Instagram y WhatsApp) con sus webhooks apuntando al backend y los tokens correctamente generados.

**Pasos:**
- Crear la aplicación en el portal de Meta for Developers.
- Configurar el producto **WhatsApp Cloud API**: número de teléfono de prueba, token de acceso temporal y posterior generación del token de larga duración.
- Configurar el producto **Messenger API para Instagram**: vinculación de la página de Facebook y cuenta de Instagram, permisos necesarios (`instagram_manage_messages`, `pages_messaging`).
- Registrar la URL del webhook para cada producto (verificación GET + recepción POST).
- Suscribir los campos relevantes: `messages`, `messaging_postbacks`, `message_echoes` (para el filtro de ecos).
- Almacenar de forma segura todos los tokens y el webhook secret en el `.env`.

**Entregable:** Ambas integraciones activas en Meta, webhooks verificados y apuntando al backend.

---

### Fase 2 — Backend: receptor y validador de webhooks

El objetivo es construir el núcleo del sistema: el pipeline que recibe, autentica y pre-procesa cada evento entrante antes de que toque cualquier otra lógica.

**Pasos:**
- Implementar el endpoint `GET /webhook` para responder al challenge de verificación de Meta.
- Implementar el endpoint `POST /webhook` para la recepción de eventos.
- Desarrollar el middleware de validación de firma **X-Hub-Signature-256**: comparar el header con el HMAC-SHA256 calculado sobre el body raw. Rechazar cualquier request que no pase esta validación.
- Desarrollar la capa de **filtrado de ecos**: identificar y descartar eventos cuyo `sender_id` coincida con el ID propio del canal receptor, o cuyo campo `is_echo` sea `true`. Esta capa es crítica para evitar que mensajes enviados desde dispositivos oficiales de Meta disparen notificaciones falsas en el cliente.
- Separar el routing por origen: un handler para eventos de Instagram, otro para WhatsApp.

**Entregable:** Pipeline de webhooks seguro con validación de firma y filtro de ecos funcional.

---

### Fase 3 — Normalización a modelo de datos unificado

El objetivo es abstraer las diferencias estructurales entre los payloads de Instagram y WhatsApp en un único modelo interno consistente.

**Pasos:**
- Diseñar el modelo unificado de mensaje con los campos comunes: `id`, `channel` (instagram | whatsapp), `conversationId`, `senderId`, `senderName`, `content`, `contentType` (text | image | audio | video | document | sticker), `timestamp`, `status` (sent | delivered | read), `isOutbound`.
- Implementar los transformadores (normalizadores) específicos por canal: uno para el payload de WhatsApp Cloud API y otro para el de Messenger API.
- Cada webhook entrante que pase las validaciones de Fase 2 pasa por su normalizador antes de ser procesado.

**Entregable:** Cualquier mensaje de cualquier canal produce un objeto unificado con la misma estructura.

---

### Fase 4 — Persistencia de datos

El objetivo es guardar de forma ordenada conversaciones y mensajes para tener historial consultable.

**Pasos:**
- Diseñar el esquema de base de datos con Prisma. Entidades principales:
  - `Contact`: representa a un usuario externo (puede tener presencia en varios canales).
  - `Conversation`: hilo de mensajes entre el negocio y un contacto en un canal específico.
  - `Message`: mensaje individual, con todos los campos del modelo unificado de Fase 3.
- Aplicar las migraciones con Prisma Migrate.
- Implementar la capa de repositorio: funciones para crear conversación si no existe, insertar mensaje, actualizar estado de mensaje.
- Manejar correctamente la concurrencia: evitar duplicados si Meta reintenta el mismo webhook.

**Entregable:** Mensajes e historial de conversaciones persistidos correctamente en PostgreSQL.

---

### Fase 5 — Distribución en tiempo real con WebSockets

El objetivo es que el cliente reciba los mensajes nuevos al instante sin necesidad de polling.

**Pasos:**
- Levantar el servidor WebSocket sobre la misma instancia del servidor HTTP.
- Implementar la gestión de conexiones: mapa de clientes conectados, reconexión, ping/pong para detectar desconexiones.
- Definir el protocolo de mensajes entre servidor y cliente (formato JSON con `type` y `payload`).
- Después de persistir un mensaje en Fase 4, emitir un evento WebSocket a todos los clientes conectados con el objeto del modelo unificado.
- Implementar el evento de actualización de estado (`delivered`, `read`) para reflejar confirmaciones de Meta en tiempo real.

**Entregable:** El cliente recibe mensajes nuevos y actualizaciones de estado en tiempo real sin recargar.

---

### Fase 6 — Envío de mensajes salientes

El objetivo es poder responder a conversaciones desde el cliente propio, enviando el mensaje a través de la API correspondiente.

**Pasos:**
- Implementar el endpoint `POST /messages/send` en el backend, que recibe `conversationId` y `content`.
- Según el canal de la conversación, llamar a la API correcta:
  - WhatsApp Cloud API: `POST /v{version}/{phone-number-id}/messages`
  - Messenger API: `POST /v{version}/me/messages`
- Persistir el mensaje saliente en la base de datos con `isOutbound: true` antes de recibirlo como eco del webhook.
- Asegurarse de que el filtro de ecos de Fase 2 descarte el webhook que Meta enviará de vuelta al recibir el mensaje enviado, evitando duplicados en la interfaz.

**Entregable:** Es posible responder mensajes desde el cliente y el flujo no genera ecos ni duplicados.

---

### Fase 7 — Interfaz de usuario: Inbox unificado

El objetivo es construir la interfaz mínima funcional que consuma el backend.

**Pasos:**
- Implementar la vista de lista de conversaciones, mostrando canal, nombre del contacto, último mensaje y timestamp.
- Implementar la vista de chat con scroll de historial y entrada de texto para enviar mensajes.
- Conectar el cliente WebSocket para recibir mensajes nuevos en tiempo real y actualizar la UI sin recargar.
- Mostrar indicadores de estado de mensaje (enviado, entregado, leído).
- Diferenciar visualmente los canales (Instagram / WhatsApp).

**Entregable:** Interfaz funcional que permite ver y responder conversaciones de ambos canales desde un solo lugar.

---

### Fase 8 — Hardening, errores y observabilidad

El objetivo es dejar el sistema robusto para uso continuo.

**Pasos:**
- Implementar manejo global de errores en el backend con respuestas estandarizadas.
- Agregar reintentos con backoff para las llamadas salientes a las APIs de Meta.
- Configurar logging estructurado (nivel info/warn/error) para trazabilidad de webhooks y envíos.
- Implementar rate limiting en los endpoints del backend.
- Documentar las variables de entorno necesarias y el proceso de puesta en marcha.

**Entregable:** Sistema estable, con logs claros y comportamiento predecible ante errores.

---

## Estructura de carpetas prevista

```
concordchat/
├── src/
│   ├── config/          # Variables de entorno y configuración global
│   ├── webhooks/        # Receptor, validador de firma y filtro de ecos
│   ├── normalizers/     # Transformadores por canal (Instagram, WhatsApp)
│   ├── repositories/    # Acceso a base de datos (Prisma)
│   ├── websocket/       # Servidor WebSocket y gestión de conexiones
│   ├── messaging/       # Lógica de envío de mensajes salientes
│   └── server.ts        # Punto de entrada
├── prisma/
│   └── schema.prisma    # Esquema de base de datos
├── chat_ia/             # Carpeta interna de trabajo con IA (ignorada por Git)
├── .env                 # Variables de entorno (ignorado por Git)
├── .gitignore
└── README.md
```

---

## Estado actual

**Fase 0 — completada.**

Completado:
- Estructura de carpetas `src/` y `prisma/` creada.
- Proyecto Node.js inicializado (`package.json`).
- Dependencias de producción instaladas: `fastify`, `ws`, `@prisma/client`, `dotenv`.
- Dependencias de desarrollo instaladas: `typescript`, `tsx`, `@types/node`, `@types/ws`, `prisma`, `eslint`, `@eslint/js`, `typescript-eslint`.
- `.gitignore` configurado: excluye `node_modules/`, `.env` y `dist/`.
- `tsconfig.json` configurado (target ES2022, CommonJS, strict mode).
- Scripts de `package.json` definidos: `dev` (tsx watch), `build` (tsc), `start` (node dist/), `lint` (eslint src).
- ESLint configurado con flat config (`eslint.config.js`), reglas recomendadas de JS + TypeScript.
- `.env` creado con variables placeholder para servidor, base de datos, WhatsApp Cloud API y Messenger API.
- `src/server.ts` implementado con Fastify y endpoint `GET /health`.
- Servidor validado: responde `{"status":"ok"}` en `localhost:3000/health`.

**Fase 1 — bloqueada (en espera).**

Bloqueada por verificación de teléfono en el registro de Meta for Developers:
- El SMS de verificación no llega con ningún operador probado (Mundo, Movistar Chile).
- El portal `developers.facebook.com` no reconoce la sesión activa de Facebook.
- Número antiguo vinculado a la cuenta de Facebook ya no está disponible.
- Acción pendiente: contactar soporte de Meta para resolver el bloqueo de SMS y el acceso a la cuenta.
