// whatsapp.service.ts
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { removeSessionDir, delay } from '../utils/session.util';
import { ConversationService } from './conversation.service';
import { GeminiService } from './gemini.service';
import fetch from 'node-fetch';
import { GRAFICAS_ENDPOINT_URL, CSV_URL } from '../config';

export class WhatsappService {
  client!: Client;
  private qrCode: string | null = null;
  private conv = new ConversationService();

  constructor(private gemini: GeminiService) {
    this.resetClient();
  }

  private resetClient() {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'bot-session' }),
      puppeteer: { headless: true }
    });
    this.qrCode = null;
    this.registerEvents();
  }

  private registerEvents() {
    this.client.on('ready', () => console.log('Cliente listo 🚀'));
    this.client.on('auth_failure', e => console.error('Auth failure:', e));
    this.client.on('disconnected', () => console.log('Cliente desconectado'));

    this.client.on('message', async msg => {
      if (!msg.from.endsWith('@g.us') || !msg.body) return;
      const text = msg.body.trim().toLowerCase();

      // solo si aparece “baruc” o ya estamos en flow
      if (!text.includes('baruc') && !this.conv.hasState(msg.from)) return;

      const reply = this.conv.handle(msg.from, msg.body);
      if (!reply) return;

      const chat = await msg.getChat();
      await chat.sendStateTyping();
      await delay(1500);
      await this.client.sendMessage(msg.from, reply);

      if (reply.startsWith('Baruc hará las gráficas de')) {
        const tipo = reply.includes('órdenes') ? 'ordenes' : 'gastos';
        const payload = {
          csv_url: CSV_URL,
          tipo
        };

        // ←– log del payload
        console.log('🔔 Enviando a gráficas:', GRAFICAS_ENDPOINT_URL, payload);

        try {
          const res = await fetch(GRAFICAS_ENDPOINT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const textBody = await res.text();
          console.log('🔔 Gráficas response body:', textBody);

          if (res.ok) {
            let imageUrls: string[] = [];
            try {
              const parsed = JSON.parse(textBody) as { image_urls?: string[] };
              imageUrls = parsed.image_urls || [];
            } catch (e) {
              console.error('❌ No es JSON válido:', e);
            }

            // ahora sí es un array
            for (const url of imageUrls) {
              try {
                const media = await MessageMedia.fromUrl(url);
                await this.client.sendMessage(msg.from, media);
              } catch (err) {
                console.error('❌ Error enviando media:', url, err);
              }
            }
          } else {
            console.error('Error al solicitar gráficas:', textBody);
          }
        } catch (e) {
          console.error('❌ Falló request a gráficas:', e);
        }
      }
    });
  }

  /** Fuerza reinicio + genera QR siempre */
  async generateQr(): Promise<string> {
    console.log('→ generateQr() start');
    // 1) destruye browser si existe (silenciar error si no hay)
    try {
      await this.client.destroy();
      console.log('– client.destroyed');
    } catch (e: any) {
      console.warn('– destroy skipped:', e.message);
    }

    // 2) new client + re-suscribe
    this.resetClient();

    // 3) escucha el evento QR
    this.client.once('qr', qr => {
      console.log('– QR recibido:', qr);
      this.qrCode = qr;
    });

    // 4) inicializa (lanza Puppeteer y dispara 'qr')
    try {
      console.log('– llamando a client.initialize()');
      await this.client.initialize();
    } catch (err) {
      console.error('⚠️ Error initializing client:', err);
      throw err;
    }

    // 5) espera a que qrCode se llene
    const qr = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout esperando QR')), 20_000);
      if (this.qrCode) {
        clearTimeout(timeout);
        return resolve(this.qrCode);
      }
      this.client.once('qr', code => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    console.log('– QR listo, devolviendo al router');
    return qr;
  }

  /** Cierra Puppeteer y borra la carpeta de sesión */
  async logout() {
    console.log('→ logout()');
    try {
      await this.client.destroy();
      console.log('– client.destroyed');
    } catch (e: any) {
      console.warn('– destroy error:', e.message);
    }

    try {
      await removeSessionDir('bot-session');
      console.log('– session dir removed');
    } catch (e: any) {
      console.warn('– removeSessionDir error:', e.message);
    }

    this.resetClient();
  }

  /** Devuelve los últimos mensajes de un grupo */
  async getGroupMessages(groupId: string, limit = 50) {
    const chat = await this.client.getChatById(groupId);
    const msgs = await chat.fetchMessages({ limit });
    return msgs.map(m => ({
      from: m.from,
      author: m.author,
      body: m.body,
      timestamp: m.timestamp
    }));
  }

  /** Lista todos los grupos con su id y nombre */
  async listGroupChats() {
    const chats = await this.client.getChats();
    return chats
      .filter(c => c.isGroup)
      .map(c => ({
        id: c.id._serialized,  // este es el “123456789-111222@g.us”
        name: c.name           // el nombre del grupo
      }));
  }
}
