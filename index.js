import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} from '@whiskeysockets/baileys';

import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Escaneie o QR Code:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('Bot conectado ao WhatsApp!');
    }

    if (connection === 'close') {
      const motivo = lastDisconnect?.error?.output?.statusCode;

      if (motivo !== DisconnectReason.loggedOut) {
        console.log('Conexão perdida. Tentando reconectar...');
        iniciarBot();
      } else {
        console.log('Sessão encerrada. Conecte novamente.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const mensagem = messages[0];

    if (!mensagem?.message || mensagem.key.fromMe) return;

    const texto =
      mensagem.message.conversation ||
      mensagem.message.extendedTextMessage?.text ||
      mensagem.message.imageMessage?.caption ||
mensagem.message.videoMessage?.caption ||
      '';

    const chat = mensagem.key.remoteJid;
const linkVideo = texto.match(/https?:\/\/[^\s]+/i)?.[0]
  ?.replace(/[.,!?]+$/, '');

if (linkVideo) {
  const pasta = await mkdtemp(join(tmpdir(), 'yun-download-'));

  try {
    const endereco = new URL(linkVideo);
    const dominio = endereco.hostname.toLowerCase();

    const plataformas = [
      'instagram.com',
      'www.instagram.com',
      'tiktok.com',
      'www.tiktok.com',
      'vm.tiktok.com',
      'vt.tiktok.com',
      'x.com',
      'www.x.com',
      'twitter.com',
      'www.twitter.com'
    ];

    if (!plataformas.includes(dominio)) {
      await sock.sendMessage(chat, {
        text: 'Não reconheço essa plataforma. Envie um link do Instagram, TikTok ou X. 💜'
      });
      return;
    }

    await sock.sendMessage(chat, {
      text: 'Estou preparando seu vídeo... ⏳'
    });

    const resultado = await execFileAsync('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '--merge-output-format', 'mp4',
      '--print', 'after_move:filepath',
      '-o', join(pasta, 'video.%(ext)s'),
      linkVideo
    ]);

    const caminhoVideo = resultado.stdout.trim().split('\n').pop();

    if (!caminhoVideo) {
      throw new Error('Não foi possível localizar o vídeo baixado.');
    }

const caminhoConvertido = join(pasta, 'video-whatsapp.mp4');

await execFileAsync('ffmpeg', [
  '-y',
  '-i', caminhoVideo,
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '23',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  caminhoConvertido
]);

const arquivoVideo = await readFile(caminhoConvertido);

    await sock.sendMessage(chat, {
      video: arquivoVideo,
      mimetype: 'video/mp4',
      caption: 'Vídeo enviado com sucesso! 💜'
    });

  } catch (erro) {
    console.log('Erro no download ou envio:', erro);

    await sock.sendMessage(chat, {
      text: 'Não consegui baixar ou enviar esse vídeo. Verifique o link ou tente novamente mais tarde. 💜'
    });

    } finally {
    await rm(pasta, { recursive: true, force: true });
  }

  return;
}
    if (texto.trim().toLowerCase() === '/menu') {
      await sock.sendMessage(chat, {
        text: `☁️ 云 • YÚN BOT

Olá! Eu sou o Yún 💜
Seu assistente no WhatsApp.

📸 *Figurinha*
/s — Criar figurinha de imagem ou vídeo.

📥 *Downloads*
Envie um link para baixar vídeos.

⚙️ *Comandos*
/ping — Verificar funcionamento.
/menu — Exibir este menu.

Yún Bot - Seu assistente favorito 💜`
      });
      return;
    }

    if (texto.trim().toLowerCase() === '/ping') {
      await sock.sendMessage(chat, {
        text: 'Pong! 🏓 O bot está funcionando!'
      });
    }




    if (texto.trim().toLowerCase() === '/s') {
      try {
        const imagem = mensagem.message.imageMessage;
const video = mensagem.message.videoMessage;
        if (!imagem && !video) {
          await sock.sendMessage(chat, {
            text: 'Envie uma imagem com a legenda /s para criar sua figurinha.'
          });
          return;
        }
if (video) {
  const pasta = await mkdtemp(join(tmpdir(), 'video-'));
  const entrada = join(pasta, 'video.mp4');
  const saida = join(pasta, 'figurinha.webp');

  try {
    const bufferVideo = await downloadMediaMessage(
      mensagem,
      'buffer',
      {},
      { logger: pino({ level: 'silent' }) }
    );

    await writeFile(entrada, bufferVideo);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', entrada,
      '-t', '15',
'-vf', 'fps=10,scale=320:320,setsar=1,format=yuva420p',
      '-an',
      '-c:v', 'libwebp_anim',
      '-quality', '50',
      '-compression_level', '4',
      '-loop', '0',
      saida
    ]);

    const figurinhaAnimada = await readFile(saida);

    await sock.sendMessage(chat, {
      sticker: figurinhaAnimada
    });

  } finally {
    await rm(pasta, { recursive: true, force: true });
  }

  return;
}
        const buffer = await downloadMediaMessage(
          mensagem,
          'buffer',
          {},
          { logger: pino({ level: 'silent' }) }
        );

const pasta = await mkdtemp(join(tmpdir(), 'fig-'));
const entrada = join(pasta, 'imagem');
const saida = join(pasta, 'figurinha.webp');

try {
  await writeFile(entrada, buffer);

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', entrada,
'-vf', 'scale=512:512,setsar=1,format=rgba',
    '-frames:v', '1',
    '-c:v', 'libwebp',
    '-quality', '80',
    saida
  ]);

  const figurinha = await readFile(saida);

  await sock.sendMessage(chat, {
    sticker: figurinha
  });
} finally {
  await rm(pasta, { recursive: true, force: true });
}

return;
        await sock.sendMessage(chat, {
          sticker: figurinha
        });

      } catch (erro) {
        console.log('Erro ao criar figurinha:', erro);
        await sock.sendMessage(chat, {
          text: 'Não consegui criar a figurinha. Tente outra imagem.'
        });
      }
    }
  });
}

iniciarBot();
