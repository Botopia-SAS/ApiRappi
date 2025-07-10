// src/services/whatsapp/messageSender.service.ts
import { Client } from 'whatsapp-web.js';
import { ClientStateService } from './clientState.service';
import { delay } from '../../utils/session.util';

export class MessageSenderService {
  private sendingQueue = new Map<string, boolean>();
  private lastSentMessages = new Map<string, { content: string; timestamp: number }>();

  constructor(
    private client: Client,
    private clientState: ClientStateService
  ) {
    // Limpiar cache de mensajes enviados cada 2 minutos
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.lastSentMessages.entries()) {
        if (now - data.timestamp > 2 * 60 * 1000) { // 2 minutos
          this.lastSentMessages.delete(key);
        }
      }
    }, 60 * 1000); // Ejecutar cada minuto
  }

  async sendMessage(chatId: string, message: string, retries = 1): Promise<boolean> {
    // Verificar si ya enviamos este mensaje recientemente
    const messageKey = `${chatId}-${message.substring(0, 100)}`;
    const lastSent = this.lastSentMessages.get(messageKey);
    
    if (lastSent && (Date.now() - lastSent.timestamp) < 10000) { // 10 segundos
      console.log(`⚠️ Mensaje duplicado detectado, ignorando: ${messageKey}`);
      return true; // Retornar true para evitar errores en la cadena
    }

    // Verificar si ya estamos enviando a este chat
    if (this.sendingQueue.get(chatId)) {
      console.log(`⚠️ Ya hay un envío en curso para ${chatId}`);
      return false;
    }

    this.sendingQueue.set(chatId, true);

    try {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Verificar que el cliente esté listo
          if (!this.clientState.isClientReady()) {
            console.log(`⚠️ Cliente no está listo, esperando...`);
            await this.clientState.waitForReady(10000);
          }

          // Esperar un poco antes de enviar
          await delay(1000);

          // Intentar envío directo
          await this.client.sendMessage(chatId, message);
          
          // Marcar mensaje como enviado
          this.lastSentMessages.set(messageKey, {
            content: message,
            timestamp: Date.now()
          });

          console.log(`✅ Mensaje enviado exitosamente a ${chatId}`);
          return true;

        } catch (error: any) {
          console.error(`❌ Error enviando mensaje (intento ${attempt}/${retries}):`, error.message);
          
          // Verificar si es un error de serialización pero el mensaje se envió
          if (error.message.includes('serialize') || error.message.includes('getMessageModel')) {
            console.log(`⚠️ Error de serialización detectado, pero el mensaje podría haberse enviado`);
            
            // Esperar un poco y verificar si el cliente sigue funcionando
            await delay(2000);
            
            if (this.clientState.isClientReady()) {
              console.log(`✅ Cliente sigue funcionando, considerando envío exitoso`);
              return true;
            }
          }
          
          // Para otros errores, esperar antes del siguiente intento
          if (attempt < retries) {
            await delay(3000);
          }
        }
      }

      console.error(`❌ Falló el envío después de ${retries} intentos`);
      return false;

    } finally {
      this.sendingQueue.delete(chatId);
    }
  }

  async sendMedia(chatId: string, media: any, retries = 1): Promise<boolean> {
    if (this.sendingQueue.get(chatId)) {
      console.log(`⚠️ Ya hay un envío en curso para ${chatId}`);
      return false;
    }

    this.sendingQueue.set(chatId, true);

    try {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          if (!this.clientState.isClientReady()) {
            const isReady = await this.clientState.waitForReady(5000);
            if (!isReady) continue;
          }

          await delay(2000);
          await this.client.sendMessage(chatId, media);
          console.log(`✅ Media enviada exitosamente a ${chatId}`);
          return true;

        } catch (error: any) {
          console.error(`❌ Error enviando media (intento ${attempt}/${retries}):`, error.message);
          
          // ✅ CAMBIO: NO tratar errores de serialización como éxitos para media
          // Los errores de serialización en media significan que la imagen no se envió
          if (error.message.includes('serialize') || error.message.includes('getMessageModel')) {
            console.log(`❌ Error de serialización en media - la imagen NO se envió`);
            // NO return true aquí - continuar con el retry o fallar
          }
          
          if (attempt < retries) {
            await delay(3000 * attempt);
          }
        }
      }

      console.error(`❌ Falló el envío de media después de ${retries} intentos`);
      return false;

    } finally {
      this.sendingQueue.delete(chatId);
    }
  }
}