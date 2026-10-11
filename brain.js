require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const ROOT = __dirname;
const KNOWLEDGE_PATH = path.join(ROOT, 'knowledge', 'conocimiento.md');
const PERSONA_PATH = path.join(ROOT, 'persona.md');
const FIXED_PATH = path.join(ROOT, 'respuestas-fijas.json');
const DATA_DIR = process.env.DATA_DIR || ROOT; // carpeta persistente (sesión de WhatsApp y citas)
fs.mkdirSync(DATA_DIR, { recursive: true });
const CITAS_PATH = path.join(DATA_DIR, 'citas.jsonl');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash';
const REQUEST_TIMEOUT_MS = 20000; // si Gemini no responde en 20 s, se reintenta / usa el respaldo

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: Gemini no respondió en ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const MAX_HISTORY = 12; // mensajes (user+model) que se recuerdan por chat
const MAX_INPUT_CHARS = 1000;

const fixed = JSON.parse(fs.readFileSync(FIXED_PATH, 'utf8'));
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Lee el archivo desde disco solo si cambió (así se puede editar la bóveda en caliente).
const fileCache = new Map();
function readFresh(file) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = fileCache.get(file);
  if (hit && hit.mtime === mtime) return hit.text;
  const text = fs.readFileSync(file, 'utf8');
  fileCache.set(file, { mtime, text });
  return text;
}

function buildSystemPrompt() {
  return [
    readFresh(PERSONA_PATH),
    '\n---\n',
    '# BÓVEDA DE CONOCIMIENTO (única fuente de verdad; si algo no está aquí, no lo sabes)\n',
    readFresh(KNOWLEDGE_PATH),
  ].join('\n');
}

const normalize = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();

const GREETINGS = new Set(fixed.saludos.map(normalize));

/** Devuelve un texto fijo, o la pregunta a mandar a Gemini, o null si no aplica. */
function route(text) {
  const clean = normalize(text);
  if (GREETINGS.has(clean)) return { fixed: fixed.menu };
  const opt = fixed.opciones[clean];
  if (opt) {
    if (opt.startsWith('@')) return { fixed: fixed[opt.slice(1)] };
    return { ask: opt };
  }
  return { ask: text };
}

// Memoria corta por chat
const histories = new Map();
function remember(chatId, role, text) {
  const h = histories.get(chatId) || [];
  h.push({ role, parts: [{ text }] });
  while (h.length > MAX_HISTORY) h.shift();
  while (h.length && h[0].role !== 'user') h.shift(); // Gemini exige empezar con 'user'
  histories.set(chatId, h);
}

const CITA_RE = /\[\[CITA\]\]\s*(\{[\s\S]*?\})/;

function extractCita(reply, chatId) {
  const m = reply.match(CITA_RE);
  if (!m) return { text: reply, cita: null };
  let cita = null;
  try {
    cita = { fecha: new Date().toISOString(), chat: chatId, ...JSON.parse(m[1]) };
    fs.appendFileSync(CITAS_PATH, JSON.stringify(cita) + '\n');
  } catch (e) {
    console.error('No pude leer la solicitud de cita:', e.message);
  }
  return { text: reply.replace(CITA_RE, '').trim(), cita };
}

/**
 * Procesa un mensaje de texto. Devuelve { text, cita }.
 * Lanza error si Gemini falla (el llamador decide el mensaje de respaldo).
 */
async function reply(chatId, rawText) {
  const text = String(rawText).slice(0, MAX_INPUT_CHARS);
  const routed = route(text);
  if (routed.fixed) return { text: routed.fixed, cita: null };

  if (!ai) throw new Error('Falta GEMINI_API_KEY en el archivo .env');

  const contents = [
    ...(histories.get(chatId) || []),
    { role: 'user', parts: [{ text: routed.ask }] },
  ];

  const config = {
    systemInstruction: buildSystemPrompt(),
    temperature: 0.5, // bajo: más fiel a la bóveda, menos "creativo"
  };

  // Si el modelo principal está saturado (503/429), reintenta y luego usa el de respaldo.
  let res;
  let lastErr;
  for (const model of [MODEL, MODEL, FALLBACK_MODEL]) {
    try {
      res = await withTimeout(ai.models.generateContent({ model, contents, config }), REQUEST_TIMEOUT_MS);
      break;
    } catch (e) {
      lastErr = e;
      if (!/"code":\s*(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED|TIMEOUT/.test(String(e.message))) throw e;
      console.warn(`Gemini (${model}) no disponible, reintentando...`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!res) throw lastErr;

  const raw = (res.text || '').trim();
  if (!raw) throw new Error('Gemini devolvió una respuesta vacía');

  const out = extractCita(raw, chatId);
  remember(chatId, 'user', routed.ask);
  remember(chatId, 'model', raw);
  return out;
}

module.exports = { reply, fixed, MODEL, DATA_DIR };
