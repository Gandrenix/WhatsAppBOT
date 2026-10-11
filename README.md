# Bot de WhatsApp — Morgan le Fae (Centro de Nutrición Avalon)

Bot de WhatsApp (whatsapp-web.js + Gemini) que atiende a mujeres que quieren cita con la nutricionista.
Responde **solo** con lo que está en [`knowledge/conocimiento.md`](knowledge/conocimiento.md) y con la personalidad de [`persona.md`](persona.md).

## Archivos importantes

| Archivo | Para qué sirve |
|---|---|
| `knowledge/conocimiento.md` | La "bóveda" de conocimiento (única fuente de verdad del bot). Se relee en cada mensaje. |
| `persona.md` | Personalidad y reglas de Morgan le Fae. |
| `respuestas-fijas.json` | Menú, horarios y ubicación (respuestas instantáneas sin IA). |
| `brain.js` / `bot.js` | Lógica con Gemini / conexión con WhatsApp. |
| `.env` | `GEMINI_API_KEY`, `GEMINI_MODEL`, `OWNER_NUMBER`. **Nunca se sube a git.** |

## Probar en local

```bash
npm install
cp .env.example .env     # y pon tu GEMINI_API_KEY
npm run chat             # prueba la IA en la terminal, sin WhatsApp
npm start                # arranca el bot y muestra el QR
```

---

# Desplegar 24/7 en Oracle Cloud (Always Free)

El bot solo hace conexiones **salientes**: no hay que abrir puertos ni tener dominio.

## 1. Crear la VM

1. Crea la cuenta en <https://www.oracle.com/cloud/free/> (pide tarjeta solo para verificar identidad).
2. **Compute → Instances → Create instance**:
   - **Image:** Ubuntu 24.04 (o 22.04).
   - **Shape:** *Ampere* → `VM.Standard.A1.Flex` con **1 OCPU y 6 GB** (el bot es liviano; 2 OCPU / 12 GB es el máximo gratis actual).
     Si no hay cupo ARM en tu región, usa `VM.Standard.E2.1.Micro` (1 GB RAM) y crea swap (ver abajo).
   - **SSH keys:** descarga la llave privada (`.key`) y guárdala bien.
   - Deja marcada la IP pública.
3. Cuando esté en *Running*, copia la **IP pública**.

## 2. Entrar al servidor e instalar Docker

Desde PowerShell (ajusta la ruta de la llave y la IP):

```bash
ssh -i C:\ruta\a\llave.key ubuntu@IP_PUBLICA
```

Ya dentro del servidor:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Vuelve a entrar por SSH (para que aplique el grupo `docker`).

## 3. Bajar el bot y configurarlo

```bash
git clone https://github.com/Gandrenix/WhatsAppBOT.git
cd WhatsAppBOT
cp .env.example .env
nano .env        # pega tu GEMINI_API_KEY (Ctrl+O, Enter, Ctrl+X para guardar)
```

## 4. Arrancar y vincular WhatsApp

```bash
docker compose up -d --build
docker compose logs -f
```

Cuando aparezca el **QR** en los logs, escanéalo con el WhatsApp del número del bot
(*Ajustes → Dispositivos vinculados → Vincular un dispositivo*).
Tiene que verse el mensaje `👑 Morgan le Fae está lista`. Sal de los logs con `Ctrl+C` (el bot sigue corriendo).

> Si el QR se ve cortado, agranda la ventana de la terminal y reinicia con `docker compose restart`.

La sesión se guarda en un volumen de Docker: **el QR se escanea una sola vez**, aunque el servidor se reinicie.

## 5. Operación diaria

```bash
docker compose logs -f --tail 100     # ver qué está pasando
docker compose restart                # reiniciar el bot
docker compose down                   # apagar (la sesión se conserva)
cat /var/lib/docker/volumes/*wa_data/_data/citas.jsonl   # ver citas solicitadas (con sudo)
```

**Actualizar** tras cambiar algo en GitHub (por ejemplo la bóveda de conocimiento):

```bash
cd ~/WhatsAppBOT && git pull && docker compose up -d --build
```

## Notas

- **Swap en VM de 1 GB** (solo si usas la Micro):
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **Cuentas gratis inactivas:** Oracle puede reclamar instancias Always Free con uso muy bajo durante muchos días.
  Pasar la cuenta a *Pay As You Go* (sigue siendo $0 si te mantienes dentro de los límites gratis) suele evitarlo. Confírmalo en la documentación de Oracle.
- **Vincular otro número / reiniciar la sesión:** `docker compose down -v` borra el volumen (sesión y citas) y pedirá un QR nuevo.
- Si el repo es **público**, no pongas datos reales sensibles en `knowledge/` (usa un repo privado).
