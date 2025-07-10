// src/services/baruc/contextualConversation.service.ts
import { GeminiService } from '../thirtparty/gemini.service';
import { IntentResponse } from './intentProcessor.service';

export interface ConversationContext {
  chatId: string;
  messages: Array<{
    timestamp: number;
    sender: 'user' | 'bot';
    content: string;
    intent?: IntentResponse;
  }>;
  currentState: 'idle' | 'processing_intent' | 'waiting_data' | 'executing';
  currentIntent?: IntentResponse;
  waitingFor?: string;
  lastActiveTime: number;
  sessionId: string;
}

export class ContextualConversationService {
  private contexts = new Map<string, ConversationContext>();
  private readonly CONTEXT_TIMEOUT = 30 * 60 * 1000; // 30 minutos
  private readonly MAX_CONTEXT_MESSAGES = 10;

  constructor(private gemini: GeminiService) {
    // Limpiar contextos expirados cada 5 minutos
    setInterval(() => this.cleanExpiredContexts(), 5 * 60 * 1000);
  }

  async processMessage(chatId: string, userMessage: string): Promise<string | null> {
    console.log(`🧠 Procesando mensaje contextual: "${userMessage}"`);
    
    // Obtener o crear contexto
    let context = this.getOrCreateContext(chatId);
    
    // Agregar mensaje del usuario al contexto
    this.addMessageToContext(context, 'user', userMessage);
    
    // Analizar la conversación completa con IA
    const analysis = await this.analyzeConversationWithAI(context);
    console.log(`🎯 Análisis de conversación:`, analysis);
    
    // Procesar según el análisis
    const response = await this.processAnalysis(context, analysis);
    
    if (response) {
      // Agregar respuesta del bot al contexto
      this.addMessageToContext(context, 'bot', response);
    }
    
    return response;
  }

  private getOrCreateContext(chatId: string): ConversationContext {
    let context = this.contexts.get(chatId);
    
    if (!context || this.isContextExpired(context)) {
      context = {
        chatId,
        messages: [],
        currentState: 'idle',
        lastActiveTime: Date.now(),
        sessionId: `${chatId}-${Date.now()}`
      };
      this.contexts.set(chatId, context);
      console.log(`🆕 Nuevo contexto creado para ${chatId}`);
    } else {
      context.lastActiveTime = Date.now();
    }
    
    return context;
  }

  private addMessageToContext(context: ConversationContext, sender: 'user' | 'bot', content: string, intent?: IntentResponse) {
    context.messages.push({
      timestamp: Date.now(),
      sender,
      content,
      intent
    });
    
    // Mantener solo los últimos N mensajes
    if (context.messages.length > this.MAX_CONTEXT_MESSAGES) {
      context.messages = context.messages.slice(-this.MAX_CONTEXT_MESSAGES);
    }
    
    console.log(`💬 Mensaje agregado al contexto (${context.messages.length} mensajes total)`);
  }

  private async analyzeConversationWithAI(context: ConversationContext): Promise<{
    intent: IntentResponse;
    needsMoreInfo: boolean;
    missingField?: string;
    shouldExecute: boolean;
    contextSummary: string;
  }> {
    // Construir historial de conversación
    const conversationHistory = context.messages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');
    
    const prompt = `
Eres un analista experto de conversaciones para un asistente de datos de Rappi llamado Baruc.

ANALIZA esta conversación completa y determina:
1. La intención del usuario
2. Si necesita más información
3. Si está listo para ejecutar la acción

INTENCIONES DISPONIBLES:
- "graficas": Generar gráficas/charts (requiere: variable [ordenes/gastos], periodo [1-4 semanas MÁXIMO])
- "mltv": Análisis de multiverticalidad (requiere: tipo_reporte [semanal/mensual])
- "op_zones": Análisis de zonas operativas (requiere: tipo_reporte [semanal/mensual])
- "saludo": Solo saluda o conversación casual
- "desconocido": No se puede determinar

IMPORTANTE PARA GRÁFICAS:
- El período máximo disponible es 4 semanas
- Si el usuario pide más de 4 semanas, automáticamente limitarlo a 4
- El período es acumulativo (incluye hoy, ayer y las semanas hacia atrás)

CONVERSACIÓN:
${conversationHistory}

CONTEXTO ACTUAL:
- Estado: ${context.currentState}
- Intención previa: ${JSON.stringify(context.currentIntent || {})}
- Esperando: ${context.waitingFor || 'nada'}

REGLAS DE ANÁLISIS:
1. Si el usuario menciona "gráficas", "gráfica", "graficas" + "órdenes"/"gastos" → intención "graficas"
2. Si falta información, identificar qué campo específico falta
3. Si toda la información está completa, marcar shouldExecute como true
4. Mantener contexto de mensajes anteriores en la misma conversación
5. Si el usuario saluda al inicio, responder el saludo pero estar atento a la siguiente solicitud
6. Para gráficas: periodo máximo 4 semanas, si pide más → limitarlo automáticamente

FORMATO DE RESPUESTA (JSON):
{
  "intent": {
    "intencion": "graficas|mltv|op_zones|saludo|desconocido",
    "variable": "ordenes|gastos|null",
    "periodo": "número(1-4)|null",
    "tipo_reporte": "semanal|mensual|null"
  },
  "needsMoreInfo": true|false,
  "missingField": "variable|periodo|tipo_reporte|null",
  "shouldExecute": true|false,
  "contextSummary": "Resumen breve de lo que el usuario quiere"
}

EJEMPLOS:
Usuario: "Hola" → {"intent":{"intencion":"saludo"},"needsMoreInfo":false,"shouldExecute":true,"contextSummary":"Usuario saluda"}
Usuario anterior: "Hola", Ahora: "Gráficas de órdenes" → {"intent":{"intencion":"graficas","variable":"ordenes","periodo":null},"needsMoreInfo":true,"missingField":"periodo","shouldExecute":false,"contextSummary":"Usuario quiere gráficas de órdenes, falta período"}

Analiza la conversación completa y responde SOLO con JSON válido:
`;

    try {
      const response = await this.gemini.generate(prompt, { temperature: 0.2 });
      const cleanResponse = response.trim();
      
      const jsonText = cleanResponse.startsWith('```json') 
        ? cleanResponse.slice(7, -3).trim()
        : cleanResponse;
      
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('❌ Error analizando conversación:', error);
      return {
        intent: { intencion: 'desconocido' },
        needsMoreInfo: false,
        shouldExecute: false,
        contextSummary: 'Error en análisis'
      };
    }
  }

  private async processAnalysis(context: ConversationContext, analysis: any): Promise<string | null> {
    // Actualizar el contexto con el nuevo intent
    context.currentIntent = analysis.intent;
    
    if (analysis.intent.intencion === 'saludo') {
      context.currentState = 'idle';
      return await this.generateGreeting();
    }

    if (analysis.intent.intencion === 'desconocido') {
      return 'No entendí lo que necesitas. Puedo ayudarte con:\n• Gráficas de órdenes o gastos (1-4 semanas)\n• Análisis MLTV\n• Reportes de zonas operativas\n\n¿Qué te gustaría hacer? 🤔';
    }

    if (analysis.needsMoreInfo) {
      context.currentState = 'waiting_data';
      context.waitingFor = analysis.missingField;
      return await this.askForMissingData(analysis.intent, analysis.missingField);
    }

    if (analysis.shouldExecute) {
      context.currentState = 'executing';
      return this.generateExecutionMessage(analysis.intent);
    }

    return null;
  }

  private async generateGreeting(): Promise<string> {
    const greetings = [
      '¡Hola! Soy Baruc, tu asistente de datos 🤖\nPuedo ayudarte con gráficas (1-4 semanas), análisis MLTV y reportes de zonas.\n¿En qué puedo ayudarte?',
      '¡Hola! 👋 Soy Baruc.\nPuedo generar gráficas de órdenes/gastos (1-4 semanas), análisis MLTV y reportes de zonas.\n¿Qué necesitas?',
      'Hola! Soy Baruc, especialista en datos de Rappi 📊\n¿Te ayudo con gráficas (máximo 4 semanas) o análisis?'
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private async askForMissingData(intent: IntentResponse, missingField: string): Promise<string> {
    const prompts = {
      variable: '¿Qué tipo de gráficas quieres ver? 📊\n• Órdenes\n• Gastos',
      periodo: '¿Cuántas semanas de datos quieres ver? 📅\n• 1-2 semanas (reciente)\n• 3-4 semanas (máximo disponible)',
      tipo_reporte: intent.intencion === 'mltv' 
        ? '¿Qué tipo de análisis MLTV necesitas? 📊\n• Semanal\n• Mensual'
        : '¿Qué tipo de reporte de zonas quieres? 🗺️\n• Semanal\n• Mensual'
    };
    
    return prompts[missingField as keyof typeof prompts] || '¿Puedes darme más detalles?';
  }

  private generateExecutionMessage(intent: IntentResponse): string {
    switch (intent.intencion) {
      case 'graficas':
        const tipoTexto = intent.variable === 'ordenes' ? 'órdenes' : 'gastos';
        const periodoTexto = intent.periodo ? ` de ${intent.periodo} semanas` : '';
        return `Haré las gráficas de ${tipoTexto}${periodoTexto} por ti, dame un minuto 📊`;
      
      case 'mltv':
        return 'Voy a generar el análisis MLTV, dame un momento... 📊';
      
      case 'op_zones':
        return 'Voy a generar el análisis de zonas operativas, dame un momento... 🗺️';
      
      default:
        return 'Procesando tu solicitud...';
    }
  }

  // Métodos de utilidad
  getContext(chatId: string): ConversationContext | null {
    return this.contexts.get(chatId) || null;
  }

  isWaitingForData(chatId: string): boolean {
    const context = this.contexts.get(chatId);
    return context?.currentState === 'waiting_data' || false;
  }

  isExecuting(chatId: string): boolean {
    const context = this.contexts.get(chatId);
    return context?.currentState === 'executing' || false;
  }

  clearContext(chatId: string): void {
    this.contexts.delete(chatId);
    console.log(`🗑️ Contexto eliminado para ${chatId}`);
  }

  private isContextExpired(context: ConversationContext): boolean {
    return Date.now() - context.lastActiveTime > this.CONTEXT_TIMEOUT;
  }

  private cleanExpiredContexts(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [chatId, context] of this.contexts.entries()) {
      if (now - context.lastActiveTime > this.CONTEXT_TIMEOUT) {
        this.contexts.delete(chatId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Limpiados ${cleanedCount} contextos expirados`);
    }
  }

  // Métodos de compatibilidad
  isAnalyzingMLTV(chatId: string): boolean {
    const context = this.contexts.get(chatId);
    return context?.currentIntent?.intencion === 'mltv' && context.currentState === 'executing';
  }

  isAnalyzingOpZones(chatId: string): boolean {
    const context = this.contexts.get(chatId);
    return context?.currentIntent?.intencion === 'op_zones' && context.currentState === 'executing';
  }

  clearMLTVState(chatId: string): void {
    const context = this.contexts.get(chatId);
    if (context && context.currentIntent?.intencion === 'mltv') {
      context.currentState = 'idle';
      context.currentIntent = undefined;
      context.waitingFor = undefined;
    }
  }

  clearOpZonesState(chatId: string): void {
    const context = this.contexts.get(chatId);
    if (context && context.currentIntent?.intencion === 'op_zones') {
      context.currentState = 'idle';
      context.currentIntent = undefined;
      context.waitingFor = undefined;
    }
  }

  hasState(chatId: string): boolean {
    const context = this.contexts.get(chatId);
    return context ? context.currentState !== 'idle' : false;
  }
}