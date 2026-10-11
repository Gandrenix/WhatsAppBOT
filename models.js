// Lista los modelos de Gemini disponibles con tu API key. Uso: npm run models
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

(async () => {
  if (!process.env.GEMINI_API_KEY) return console.error('Falta GEMINI_API_KEY en .env');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const pager = await ai.models.list();
  for await (const m of pager) {
    if ((m.supportedActions || []).includes('generateContent')) console.log(m.name.replace('models/', ''));
  }
})().catch((e) => console.error(e.message));
