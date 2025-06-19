// whatsapp.service.ts
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import { removeSessionDir, delay } from '../utils/session.util';
import { ConversationService } from './conversation.service';
import { GeminiService } from './gemini.service';
import fetch from 'node-fetch';
import { GRAFICAS_ENDPOINT_URL } from '../config';
import { GoogleSheetsService } from './googleSheets.service';
import { v2 as cloudinary } from 'cloudinary';
import { ContactId } from 'whatsapp-web.js';

// Configurar Cloudinary (añade esto después de los imports)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export class WhatsappService {
  client!: Client;
  private qrCode: string | null = null;
  private conv: ConversationService;

  constructor(private gemini: GeminiService, private sheetsService: GoogleSheetsService) {
    this.conv = new ConversationService(this.gemini);
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
      const BOT_ID = this.client.info.wid._serialized as unknown as ContactId;
      const isBotMentioned = msg.mentionedIds?.includes(BOT_ID)

      console.log('Mensaje recibido:', {
        from: msg.from,
        body: msg.body
      });

      console.log('Texto procesado:', text);
      console.log('¿Mencionado al bot?', isBotMentioned);

      if (!isBotMentioned && !text.includes('baruc') && !this.conv.hasState(msg.from)) {
        return;
      }

      const rawForConv = isBotMentioned && !text.includes('baruc')
        ? `baruc ${msg.body}`   
        : msg.body;

      console.log('Mensaje para la conversación:', rawForConv);

      const reply = await this.conv.handle(msg.from, rawForConv);
      if (!reply) return;

      const chat = await msg.getChat();
      await delay(500);
      await chat.sendStateTyping();
      await delay(1500);
      await this.client.sendMessage(msg.from, reply);

      // Manejar análisis OP ZONES
      if (this.conv.isAnalyzingOpZones(msg.from)) {
        try {
          await this.handleOpZonesAnalysis(msg.from);
        } catch (error) {
          console.error('Error en análisis OP ZONES:', error);
          await this.client.sendMessage(msg.from, 'Lo siento, hubo un error al generar el reporte de OP ZONES 😕');
        } finally {
          this.conv.clearOpZonesState(msg.from);
        }
      }

      // Manejar análisis MLTV
      if (this.conv.isAnalyzingMLTV(msg.from)) {
        try {
          await this.handleMLTVAnalysis(msg.from);
        } catch (error) {
          console.error('Error en análisis MLTV:', error);
          await this.client.sendMessage(msg.from, 'Lo siento, hubo un error al analizar los datos de multiverticalidad 😕');
        } finally {
          this.conv.clearMLTVState(msg.from);
        }
      }

      // Manejar gráficas existentes
      if (reply.startsWith('Haré las gráficas de')) {
        const tipo = reply.includes('órdenes') ? 'ordenes' : 'gastos';

        try {
          // 1. Obtener datos CSV
          const csvData = await this.sheetsService.getDataAsCSV();

          // 2. Subir a Cloudinary
          const uploadResponse = await new Promise<any>((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                resource_type: 'raw',
                public_id: `data_${Date.now()}`,
                format: 'csv'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(csvData);
          });

          // 3. Usar la URL segura de Cloudinary
          const csv_url = (uploadResponse as { secure_url: string }).secure_url;

          const payload = {
            csv_url,
            tipo
          };

          // 4. Enviar al microservicio
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
        } catch (err) {
          console.error('❌ Error procesando datos:', err);
          await this.client.sendMessage(msg.from, 'Lo siento, hubo un error al procesar los datos 😕');
        }
      }
    });
  }

  /**
   * Maneja el análisis de datos OP ZONES con Gemini
   */
  private async handleOpZonesAnalysis(chatId: string) {
    try {
      // 1. Obtener datos OP ZONES de Google Sheets
      const opZonesData = await this.sheetsService.getOpZonesDataForAnalysis();
      
      // 2. Crear prompt específico para OP ZONES
      const analysisPrompt = `
Genera un reporte que muestre, la variación entre la semana actual y la anterior en cuanto a las Bases de usuarios y el número de órdenes.
La información debe estar segmentada por país y por clasificación de zonas (0,2,4), responde en un formato claro y tipo chat de WhatsApp.

Datos a analizar:
${opZonesData}

INSTRUCCIONES ESPECÍFICAS:
- Saluda al equipo, por ejemplo: "Hola team, aquí está el reporte de OP ZONES"
- Formato de mensaje de WhatsApp (usa emojis relevantes)
- Muestra variaciones porcentuales y absolutas
- Segmenta por país y clasificación de zonas (0,2,4)
- Resalta los datos más importantes
- Usa formato legible para móvil
- Máximo 500 palabras
- Por país añade las 5 zonas con más usuarios
_ Incluye la variación semanal de bases de usuarios
- Incluye la variación semanal de órdenes

Ejemplo de formato esperado:
🌍 **REPORTE OP ZONES - VARIACIÓN SEMANAL**

📊 **ARGENTINA** 
Zona 0: +15% órdenes (📈 +1,250)
La base aumentó un 10% respecto a la semana pasada (+100 usuarios)

Zona 2: +10% órdenes (📈 +800)
La base aumentó un 5% respecto a la semana pasada (+50 usuarios)

TOP 5 zonas: Buenos Aires, Córdoba, Rosario, Mendoza, La Plata



📊 **COLOMBIA**
Zona 2: -5% órdenes (📉 -420)
La base decreció un 20% respecto a la semana pasada (-200 usuarios)

Zona 4: +8% órdenes (📈 +600)
La base aumentó un 15% respecto a la semana pasada (+150 usuarios)

TOP 5 zonas: Bogotá, Medellín, Cali, Barranquilla, Cartagena

💡 **Insights principales:**
- Mayor crecimiento en...
- Atención requerida en...
      `;

      // 3. Enviar a Gemini para análisis
      await delay(2500); // Simular tiempo de procesamiento
      const analysis = await this.gemini.generate(analysisPrompt, { temperature: 0.2 });

      // 4. Enviar reporte al chat
      await this.client.sendMessage(chatId, analysis);
      
    } catch (error) {
      console.error('Error en análisis OP ZONES:', error);
      throw error;
    }
  }

  /**
   * Maneja el análisis de datos MLTV con Gemini
   */
  private async handleMLTVAnalysis(chatId: string) {
    try {
      // 1. Obtener datos MLTV de Google Sheets
      const mltvData = await this.sheetsService.getMLTVDataForAnalysis();
      
      // 2. Calcular fechas correctas
      const today = new Date();
      const currentWeekStart = new Date(today);
      currentWeekStart.setDate(today.getDate() - today.getDay() + 1); // Lunes de esta semana
      
      const lastWeekStart = new Date(currentWeekStart);
      lastWeekStart.setDate(currentWeekStart.getDate() - 7); // Lunes de la semana pasada
      
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6); // Domingo de la semana pasada
      
      // Formatear fechas
      const formatDate = (date: Date) => {
        return date.toLocaleDateString('es-ES', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
      };
      
      const todayStr = formatDate(today);
      const lastWeekStr = `${formatDate(lastWeekStart)} al ${formatDate(lastWeekEnd)}`;
      
      // 3. Crear prompt mejorado para Gemini
      const analysisPrompt = `
Eres un analista de datos de Rappi especializado en multiverticalidad (MLTV). 

CONTEXTO TEMPORAL:
- Fecha actual: ${todayStr}
- Semana pasada a analizar: ${lastWeekStr}
- La semana actual (${formatDate(currentWeekStart)} en adelante) NO debe incluirse en el análisis

INSTRUCCIONES:
Analiza ÚNICAMENTE los datos correspondientes a la semana pasada (${lastWeekStr}) de los siguientes datos de multiverticalidad:

${mltvData}

IMPORTANTE: 
- Filtra mentalmente solo los datos de la semana ${lastWeekStr}
- Ignora cualquier dato de la semana actual (${formatDate(currentWeekStart)} en adelante)
- Si no encuentras datos específicos de la semana pasada, menciona que los datos pueden estar incompletos

Por favor proporciona:
1. **Resumen ejecutivo** (performance de la semana ${lastWeekStr})
2. **Métricas destacadas** (números específicos de esa semana)
3. **Tendencias observadas** (comparación con semanas anteriores si disponible)
4. **Recomendaciones** (2-3 acciones específicas basadas en los datos)

Usa emojis relevantes y mantén un tono profesional pero accesible. Máximo 400 palabras.
Si los datos no contienen información clara de la semana pasada, menciona esta limitación.
      `;

      // 4. Enviar a Gemini para análisis
      await delay(2000); // Simular tiempo de procesamiento
      const analysis = await this.gemini.generate(analysisPrompt, { temperature: 0.3 });

      // 5. Enviar análisis al chat con fechas correctas
      await this.client.sendMessage(chatId, `📊 **ANÁLISIS DE MULTIVERTICALIDAD**\n**Semana analizada: ${lastWeekStr}**\n\n${analysis}`);
      
    } catch (error) {
      console.error('Error en análisis MLTV:', error);
      throw error;
    }
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
