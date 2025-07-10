// whatsapp.service.ts
import { Client, LocalAuth } from 'whatsapp-web.js';
import { removeSessionDir } from '../utils/session.util';
import { ConversationService } from './baruc/conversation.service';
import { GeminiService } from './thirtparty/gemini.service';
import { GoogleSheetsService } from './thirtparty/googleSheets.service';
import { MessageHandlerService } from './whatsapp/messageHandler.service';
import { OpZonesService } from './rappi/opZones.service';
import { MLTVService } from './rappi/mltv.service';
import { ChartsService } from './baruc/charts.service';
import { CloudinaryService } from './thirtparty/cloudinary.service';
import { ClientStateService } from './whatsapp/clientState.service';

export class WhatsappService {
  client!: Client;
  private qrCode: string | null = null;
  private conv: ConversationService;
  private messageHandler!: MessageHandlerService;
  private clientState!: ClientStateService;

  constructor(private gemini: GeminiService, private sheetsService: GoogleSheetsService) {
    this.conv = new ConversationService(this.gemini);
    this.resetClient();
  }

  private setupServices(): void {
    // ✅ CORRECCIÓN: Usar getInstance() para todos los singletons
    const cloudinaryService = CloudinaryService.getInstance();
    const opZonesService = new OpZonesService(this.gemini, this.sheetsService);
    const mltvService = new MLTVService(this.gemini, this.sheetsService);
    
    const chartsService = ChartsService.getInstance();
    
    this.clientState = ClientStateService.getInstance();
    
    this.messageHandler = new MessageHandlerService(
      this.client,
      this.conv,
      opZonesService,
      mltvService,
      chartsService,
      this.clientState
    );

    console.log('🔧 Servicios configurados');
    console.log('📊 Estado inicial del cliente:', this.clientState.getReadyStatus());
  }

  private resetClient(): void {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'bot-session' }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      }
    });
    this.qrCode = null;
    
    this.setupServices();
    this.registerEvents();
  }

  private registerEvents(): void {
    this.client.on('message', async (msg) => {
      try {
        await this.messageHandler.handleMessage(msg);
      } catch (error) {
        console.error('❌ Error manejando mensaje:', error);
      }
    });

    // ✅ AGREGAR: Eventos de estado del cliente
    this.client.on('ready', () => {
      console.log('✅ Cliente WhatsApp listo');
      this.clientState.setClientReady(true);
    });

    this.client.on('authenticated', () => {
      console.log('🔐 Cliente autenticado');
      this.clientState.setClientAuthenticated(true);
    });

    this.client.on('auth_failure', () => {
      console.log('❌ Fallo de autenticación');
      this.clientState.setClientReady(false);
      this.clientState.setClientAuthenticated(false);
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔌 Cliente desconectado:', reason);
      this.clientState.setClientReady(false);
      this.clientState.setClientAuthenticated(false);
    });

    // ✅ AGREGAR: Evento QR para debug
    this.client.on('qr', (qr) => {
      console.log('📱 QR Code generado - escanear para autenticar');
    });
  }

  async generateQr(): Promise<string> {
    try {
      await this.client.destroy();
    } catch (e: any) {
      console.warn('– destroy skipped:', e.message);
    }

    this.resetClient();

    this.client.once('qr', qr => {
      this.qrCode = qr;
    });

    try {
      await this.client.initialize();
    } catch (err) {
      console.error('⚠️ Error initializing client:', err);
      throw err;
    }

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

  async logout(): Promise<void> {
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

  async getGroupMessages(groupId: string, limit = 50) {
    if (!this.clientState.isClientReady()) {
      throw new Error('Cliente no está listo');
    }

    const chat = await this.client.getChatById(groupId);
    const msgs = await chat.fetchMessages({ limit });
    return msgs.map(m => ({
      from: m.from,
      author: m.author,
      body: m.body,
      timestamp: m.timestamp
    }));
  }

  async listGroupChats() {
    if (!this.clientState.isClientReady()) {
      throw new Error('Cliente no está listo');
    }

    const chats = await this.client.getChats();
    return chats
      .filter(c => c.isGroup)
      .map(c => ({
        id: c.id._serialized,
        name: c.name
      }));
  }
}
