require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { reply, fixed, MODEL, DATA_DIR } = require('./brain');

// Opcional: número que recibe un aviso cuando alguien pide cita (solo dígitos, con indicativo. Ej: 573001234567)
const OWNER = (process.env.OWNER_NUMBER || '').replace(/\D/g, '');

// En servidor (Docker) DATA_DIR apunta a un volumen persistente; en local es la carpeta del proyecto.
const AUTH_DIR = path.join(DATA_DIR, '.wwebjs_auth');

// Si el contenedor se apagó de golpe, Chromium deja archivos de bloqueo que impiden volver a abrir la sesión.
function clearChromiumLocks(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) clearChromiumLocks(full);
    else if (/^Singleton(Lock|Cookie|Socket)$/.test(entry.name)) fs.rmSync(full, { force: true });
  }
}
clearChromiumLocks(AUTH_DIR);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_DIR }), // guarda la sesión: el QR se escanea una sola vez
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Chromium del sistema (necesario en ARM)
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  },
});

client.on('qr', (qr) => {
  console.log('\nEscanea este QR con el WhatsApp del número del bot (Dispositivos vinculados):\n');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => console.log('Sesión autenticada.'));
client.on('auth_failure', (m) => console.error('Fallo de autenticación:', m));
client.on('disconnected', (r) => console.log('Desconectado:', r));
client.on('ready', () => console.log(`👑 Morgan le Fae está lista (modelo: ${MODEL}).`));

// Un mensaje a la vez por chat, para que las respuestas no se crucen.
const queues = new Map();
function enqueue(chatId, task) {
  const prev = queues.get(chatId) || Promise.resolve();
  const next = prev.then(task).catch((e) => console.error('Error en cola:', e)).finally(() => {
    if (queues.get(chatId) === next) queues.delete(chatId);
  });
  queues.set(chatId, next);
}

client.on('message', (msg) => {
  // Solo chats privados, de otras personas
  if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

  enqueue(msg.from, async () => {
    const send = (text) => client.sendMessage(msg.from, text, { sendSeen: false });

    if (msg.type !== 'chat' || !msg.body?.trim()) {
      await send(fixed.no_texto);
      return;
    }

    let chat;
    try {
      chat = await msg.getChat();
      chat.sendStateTyping().catch(() => {});
    } catch (_) {}

    try {
      console.log(`← ${msg.from}: ${msg.body.slice(0, 120)}`);
      const { text, cita } = await reply(msg.from, msg.body);
      await send(text);
      console.log(`→ ${text.slice(0, 120).replace(/\n/g, ' ')}`);

      if (cita) {
        console.log('📅 Nueva solicitud de cita:', cita);
        if (OWNER) {
          const aviso =
            `📅 *Nueva solicitud de cita*\n\nNombre: ${cita.nombre}\nServicio: ${cita.servicio}\n` +
            `Modalidad: ${cita.modalidad}\nPreferencia: ${cita.preferencia}\nChat: wa.me/${msg.from.split('@')[0]}`;
          client.sendMessage(`${OWNER}@c.us`, aviso).catch((e) => console.error('No pude avisar a la dueña:', e.message));
        }
      }
    } catch (e) {
      console.error('Error al responder:', e.message);
      await send(fixed.fallo).catch(() => {});
    } finally {
      chat?.clearState?.().catch(() => {});
    }
  });
});

client.initialize();
