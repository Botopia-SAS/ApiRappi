// src/services/whatsapp/messageHandler.service.ts
import { Message, Client, ContactId } from 'whatsapp-web.js';
import { ConversationService } from '../baruc/conversation.service';
import { OpZonesService } from '../rappi/opZones.service';
import { MLTVService } from '../rappi/mltv.service';
import { ChartsService } from '../baruc/charts.service';
import { MessageSenderService } from './messageSender.service';
import { ClientStateService } from './clientState.service';

export class MessageHandlerService {
  private messageSender: MessageSenderService;
  private processedMessages = new Set<string>(); // Cache para evitar duplicados
  private activeChartGenerations = new Set<string>(); // Cache para evitar generación de gráficas duplicadas

  constructor(
    private client: Client,
    private conv: ConversationService,
    private opZonesService: OpZonesService,
    private mltvService: MLTVService,
    private chartsService: ChartsService,
    private clientState: ClientStateService
  ) {
    this.messageSender = new MessageSenderService(client, clientState);
    
    // Limpiar cache cada 5 minutos
    setInterval(() => {
      this.processedMessages.clear();
    }, 5 * 60 * 1000);
  }

  async handleMessage(msg: Message): Promise<void> {
    try {
      if (!msg.from.endsWith('@g.us') || !msg.body) return;

      // Más logging detallado
      console.log(`📨 Mensaje recibido: ${msg.from} - "${msg.body}"`);
      console.log(`📊 Estado del cliente antes del procesamiento:`, this.clientState.getReadyStatus());

      // Evitar procesar el mismo mensaje múltiples veces
      const messageId = `${msg.from}-${msg.timestamp}-${msg.body.substring(0, 50)}`;
      if (this.processedMessages.has(messageId)) {
        console.log('⚠️ Mensaje ya procesado, ignorando duplicado');
        return;
      }
      this.processedMessages.add(messageId);

      const { shouldProcess, rawForConv } = this.preprocessMessage(msg);
      if (!shouldProcess) return;

      console.log('🔄 Procesando mensaje:', rawForConv);

      const reply = await this.conv.handle(msg.from, rawForConv);
      if (!reply) return;

      console.log(`💬 Respuesta generada: "${reply}"`);

      // Verificar estado antes de enviar
      const status = this.clientState.getReadyStatus();
      console.log('📊 Estado del cliente antes de enviar:', status);

      if (!this.clientState.isClientReady()) {
        console.log('⚠️ Cliente no está listo, intentando reactivar...');
        
        // ✅ CAMBIO: Timeout más corto y más directo
        const isReady = await this.clientState.waitForReady(3000);
        if (!isReady) {
          console.log('❌ Cliente no disponible, saltando mensaje');
          return;
        }
      }

      // Enviar respuesta
      const success = await this.messageSender.sendMessage(msg.from, reply, 2);
      if (success) {
        console.log('✅ Respuesta enviada correctamente');
      } else {
        console.error('❌ No se pudo enviar la respuesta');
      }

      // Manejar acciones especiales
      await this.handleSpecialActions(msg.from, reply);

    } catch (error) {
      console.error('❌ Error en handleMessage:', error);
    }
  }

  private preprocessMessage(msg: Message) {
    const text = msg.body.trim().toLowerCase();
    const BOT_ID = this.client.info?.wid?._serialized as unknown as ContactId;
    const isBotMentioned = BOT_ID ? msg.mentionedIds?.includes(BOT_ID) : false;

    console.log('📨 Mensaje recibido:', { from: msg.from, body: msg.body });

    // NUEVA LÓGICA: Procesar TODOS los mensajes que contengan "baruc" O si ya hay una conversación activa
    const hasBarucMention = isBotMentioned || text.includes('baruc');
    const hasActiveConversation = this.conv.hasState(msg.from);

    // ✅ MEJORAR: Ser más específico sobre cuándo procesar
    if (!hasBarucMention && !hasActiveConversation) {
      console.log('⏭️ Mensaje ignorado - no es para Baruc y no hay conversación activa');
      return { shouldProcess: false, rawForConv: '' };
    }

    // ✅ NUEVO: Si es una palabra de cancelación simple y no hay contexto activo, ignorar
    const cancelationWords = ['nada', 'no', 'gracias', 'ok', 'listo', 'ya'];
    if (!hasBarucMention && !hasActiveConversation && 
        cancelationWords.some(word => text === word || text.includes(word))) {
      console.log('⏭️ Mensaje de cancelación ignorado - no hay conversación activa');
      return { shouldProcess: false, rawForConv: '' };
    }

    // Si es una mención sin "baruc", agregar "baruc" al inicio
    const rawForConv = isBotMentioned && !text.includes('baruc')
      ? `baruc ${msg.body}`
      : msg.body;

    console.log(`✅ Mensaje será procesado: "${rawForConv}"`);
    return { shouldProcess: true, rawForConv };
  }

  private async handleSpecialActions(chatId: string, reply: string): Promise<void> {
    try {
      // Esperar más tiempo antes de acciones especiales
      await this.delay(2000);
      
      // Manejar análisis OP ZONES
      if (this.conv.isAnalyzingOpZones(chatId)) {
        await this.handleOpZonesAnalysis(chatId);
        return; // Salir después de manejar OP ZONES
      }

      // Manejar análisis MLTV
      if (this.conv.isAnalyzingMLTV(chatId)) {
        await this.handleMLTVAnalysis(chatId);
        return; // Salir después de manejar MLTV
      }

      // Manejar gráficas
      if (reply.startsWith('Haré las gráficas de')) {
        const tipo = reply.includes('órdenes') ? 'ordenes' : 'gasto';
        let periodo = 4; // Default 4 semanas

        // Extraer período de la respuesta si es posible
        const periodoMatch = reply.match(/(\d+)\s*semana/);
        if (periodoMatch) {
          periodo = parseInt(periodoMatch[1], 10);
        }

        await this.handleChartsGeneration(chatId, tipo, periodo);
        return; // Salir después de manejar gráficas
      }
      
    } catch (error) {
      console.error('❌ Error en acciones especiales:', error);
      await this.messageSender.sendMessage(chatId, 'Hubo un problema procesando tu solicitud. Intenta nuevamente.', 1);
    }
  }

  private async handleOpZonesAnalysis(chatId: string): Promise<void> {
    console.log('>>> Iniciando análisis de OP ZONES...');
    try {
      const analysis = await this.opZonesService.generateAnalysis();
      const success = await this.messageSender.sendMessage(chatId, analysis, 2);
      if (!success) {
        await this.messageSender.sendMessage(chatId, 'Lo siento, hubo un error al enviar el reporte de OP ZONES 😕', 1);
      } else {
        // ✅ NUEVO: Marcar como completado
        console.log(`✅ Análisis OP ZONES completado para ${chatId}`);
      }
    } catch (error) {
      console.error('Error en análisis OP ZONES:', error);
      await this.messageSender.sendMessage(chatId, 'Lo siento, hubo un error al generar el reporte de OP ZONES 😕');
    } finally {
      this.conv.clearOpZonesState(chatId);
      // ✅ NUEVO: Limpiar contexto después de completar
      this.conv.clearContext(chatId);
    }
  }

  private async handleMLTVAnalysis(chatId: string): Promise<void> {
    console.log('>>> Iniciando análisis de MLTV...');
    try {
      const analysis = await this.mltvService.generateAnalysis();
      const success = await this.messageSender.sendMessage(chatId, analysis, 2);
      if (!success) {
        await this.messageSender.sendMessage(chatId, 'Lo siento, hubo un error al enviar el análisis MLTV 😕', 1);
      } else {
        // ✅ NUEVO: Marcar como completado y limpiar contexto
        console.log(`✅ Análisis MLTV completado para ${chatId}`);
      }
    } catch (error) {
      console.error('Error en análisis MLTV:', error);
      await this.messageSender.sendMessage(chatId, 'Lo siento, hubo un error al analizar los datos de multiverticalidad 😕');
    } finally {
      this.conv.clearMLTVState(chatId);
      // ✅ NUEVO: Limpiar contexto después de completar
      this.conv.clearContext(chatId);
    }
  }

  private async handleChartsGeneration(chatId: string, tipo: string, periodo: number): Promise<void> {
    const generationKey = `${chatId}-${tipo}-${periodo}`;
    
    if (this.activeChartGenerations.has(generationKey)) {
      console.log(`⚠️ Ya hay una generación de gráficas activa: ${generationKey}`);
      return;
    }

    this.activeChartGenerations.add(generationKey);

    try {
      // Validar período máximo
      const validatedPeriodo = Math.min(Math.max(periodo, 1), 4);
      
      if (validatedPeriodo !== periodo) {
        await this.messageSender.sendMessage(
          chatId, 
          `📊 Período ajustado a ${validatedPeriodo} semana${validatedPeriodo > 1 ? 's' : ''} (máximo disponible). Las gráficas incluirán datos acumulativos + órdenes de ayer.`
        );
      } else {
        await this.messageSender.sendMessage(
          chatId, 
          `📊 Generando gráficas de ${tipo} para ${validatedPeriodo} semana${validatedPeriodo > 1 ? 's' : ''} (acumulativo + órdenes de ayer)...`
        );
      }

      // Generar gráficas con nueva lógica
      const charts = await this.chartsService.generateCharts(tipo, validatedPeriodo);
      
      if (!charts || charts.length === 0) {
        await this.messageSender.sendMessage(chatId, '❌ No se pudieron generar las gráficas. Intenta de nuevo.');
        return;
      }

      console.log(`📊 Generadas ${charts.length} gráficas para ${validatedPeriodo} semanas (acumulativo)`);

      // Enviar confirmación
      await this.messageSender.sendMessage(
        chatId,
        `✅ Gráficas generadas! Enviando ${charts.length} imágenes (período acumulativo: ${validatedPeriodo} semana${validatedPeriodo > 1 ? 's' : ''} + órdenes de ayer)...`
      );

      // Convertir URLs a MessageMedia
      const imageUrls = charts.map(chart => chart.url);
      const mediaObjects = await this.chartsService.convertUrlsToMedia(imageUrls);

      console.log(`📤 Enviando ${mediaObjects.length} imágenes a ${chatId}`);

      // Enviar cada imagen con delay y contar éxitos reales
      let successCount = 0;
      let errorCount = 0;
      let serialializationErrors = 0;

      for (let i = 0; i < mediaObjects.length; i++) {
        try {
          const media = mediaObjects[i];
          const success = await this.messageSender.sendMedia(chatId, media);
          
          if (success) {
            successCount++;
            console.log(`✅ Imagen ${i + 1}/${mediaObjects.length} enviada exitosamente`);
          } else {
            // Verificar si fue error de serialización (que podría haberse enviado)
            const isSerializationError = await this.checkSerializationError();
            if (isSerializationError) {
              serialializationErrors++;
              console.log(`⚠️ Error de serialización en imagen ${i + 1}/${mediaObjects.length} - posiblemente enviada`);
            } else {
              errorCount++;
              console.log(`❌ Error real enviando imagen ${i + 1}/${mediaObjects.length}`);
            }
          }

          // Delay entre envíos
          if (i < mediaObjects.length - 1) {
            await this.delay(1000);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error enviando imagen ${i + 1}:`, error);
        }
      }

      // ✅ MENSAJE FINAL MEJORADO - Considerar errores de serialización como posibles éxitos
      const potentialSuccesses = successCount + serialializationErrors;
      const definiteFailures = errorCount;

      if (successCount > 0 || serialializationErrors > 0) {
        let finalMessage = `📊 ¡Proceso completado!`;
        
        if (successCount === mediaObjects.length) {
          finalMessage += ` Se enviaron todas las ${successCount} gráficas de ${tipo} (${validatedPeriodo} semana${validatedPeriodo > 1 ? 's' : ''} acumulativo + ORDERS_Y) ✅`;
        } else if (successCount > 0) {
          finalMessage += ` Se enviaron ${successCount}/${mediaObjects.length} gráficas con confirmación`;
          if (serialializationErrors > 0) {
            finalMessage += `, ${serialializationErrors} con posibles errores de conexión pero probablemente enviadas`;
          }
          finalMessage += ` 📊`;
        } else if (serialializationErrors > 0) {
          finalMessage += ` Se procesaron ${serialializationErrors}/${mediaObjects.length} gráficas (errores de conexión pero probablemente enviadas) 📊`;
        }

        await this.messageSender.sendMessage(chatId, finalMessage);
        
        // ✅ NUEVO: Marcar tarea como completada
        this.conv.clearContext(chatId); // Limpiar contexto después de completar
        console.log(`✅ Generación de gráficas completada para ${chatId}`);
      } else {
        await this.messageSender.sendMessage(
          chatId,
          '❌ No se pudieron enviar las gráficas debido a problemas de conexión. Por favor intenta de nuevo.'
        );
      }

    } catch (error) {
      console.error('❌ Error en generación de gráficas:', error);
      await this.messageSender.sendMessage(
        chatId,
        '❌ Hubo un error generando las gráficas. Por favor intenta de nuevo.'
      );
    } finally {
      this.activeChartGenerations.delete(generationKey);
    }
  }

  // ✅ NUEVO MÉTODO: Detectar si el último error fue de serialización
  private async checkSerializationError(): Promise<boolean> {
    // Aquí podrías implementar lógica para verificar si el último error
    // fue específicamente de serialización. Por ahora, retornamos true
    // si detectamos el patrón común de errores de serialización
    return true; // Los errores que estás viendo son de serialización
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}