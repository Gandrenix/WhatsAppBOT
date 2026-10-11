// Prueba la "mente" del bot en la terminal, sin WhatsApp. Uso: npm run chat
const readline = require('readline');
const { reply, MODEL } = require('./brain');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Chat local con Morgan le Fae (modelo: ${MODEL}). Escribe "salir" para terminar.\n`);

const ask = () =>
  rl.question('Tú: ', async (line) => {
    if (!line.trim()) return ask();
    if (line.trim().toLowerCase() === 'salir') return rl.close();
    try {
      const { text, cita } = await reply('local-test', line);
      console.log(`\nMorgan: ${text}\n`);
      if (cita) console.log('[se registró una cita en citas.jsonl]', cita, '\n');
    } catch (e) {
      console.error('\n[error]', e.message, '\n');
    }
    ask();
  });
ask();
