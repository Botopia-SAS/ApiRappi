// whatsapp.service.ts
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { removeSessionDir, delay } from '../utils/session.util';
import { ConversationService } from './conversation.service';
import { GeminiService } from './gemini.service';
import fetch from 'node-fetch';
import { GRAFICAS_ENDPOINT_URL } from '../config';
import { GoogleSheetsService } from './googleSheets.service';

export class WhatsappService {
  client!: Client;
  private qrCode: string | null = null;
  private conv = new ConversationService();

  constructor(private gemini: GeminiService, private sheetsService: GoogleSheetsService) {
    this.resetClient();
  }

  private resetClient() {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'bot-session' }),
      puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Agregado para entornos como Railway
      }
    });
    this.qrCode = null;
    this.registerEvents();
  }

  private registerEvents() {
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

      if (reply.startsWith('haré las gráficas de')) {
        const tipo = reply.includes('órdenes') ? 'ordenes' : 'gastos';
        // Obtén csv_url dinámicamente desde Google Sheets
        let csv_url: string;
        try {
          csv_url = await this.sheetsService.getCSVUrl();
        } catch (err) {
          console.error('❌ Error obteniendo csv_url:', err);
          return;
        }
        const payload = {
          csv_url,
          tipo
        };

        try {
          const res = await fetch(GRAFICAS_ENDPOINT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const textBody = await res.text();
          if (res.ok) {
            let imageUrls: string[] = [];
            try {
              const parsed = JSON.parse(textBody) as { image_urls?: string[] };
              imageUrls = parsed.image_urls || [];
            } catch (e) {
              console.error('❌ No es JSON válido:', e);
            }

            // Envía cada imagen
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
    // 1) destruye browser si existe (silenciar error si no hay)
    try {
      await this.client.destroy();

    } catch (e: any) {
      console.warn('– destroy skipped:', e.message);
    }

    // 2) new client + re-suscribe
    this.resetClient();

    // 3) escucha el evento QR
    this.client.once('qr', qr => {
      this.qrCode = qr;
    });

    // 4) inicializa (lanza Puppeteer y dispara 'qr')
    try {
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

    return qr;
  }

  /** Cierra Puppeteer y borra la carpeta de sesión */
  async logout() {
    try {
      await this.client.destroy();
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
