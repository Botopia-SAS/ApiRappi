import { GeminiService } from '../thirtparty/gemini.service';
import { ContextualConversationService } from './contextualConversation.service';

export class ConversationService {
  private contextualService: ContextualConversationService;

  constructor(private gemini: GeminiService) {
    this.contextualService = new ContextualConversationService(this.gemini);
  }

  async handle(chatId: string, message: string): Promise<string | null> {
    console.log(`🤖 ConversationService procesando: "${message}"`);
    
    // Usar el nuevo sistema contextual
    const response = await this.contextualService.processMessage(chatId, message);
    
    return response;
  }

  // Método para obtener el contexto completo
  getConversationState(chatId: string) {
    const context = this.contextualService.getContext(chatId);
    return context ? {
      currentIntent: context.currentIntent,
      waitingFor: context.waitingFor,
      attempts: 0 // Para compatibilidad
    } : null;
  }

  // Métodos de compatibilidad con el sistema existente
  isAnalyzingMLTV(chatId: string): boolean {
    return this.contextualService.isAnalyzingMLTV(chatId);
  }

  isAnalyzingOpZones(chatId: string): boolean {
    return this.contextualService.isAnalyzingOpZones(chatId);
  }

  clearMLTVState(chatId: string): void {
    this.contextualService.clearMLTVState(chatId);
  }

  clearOpZonesState(chatId: string): void {
    this.contextualService.clearOpZonesState(chatId);
  }

  hasState(chatId: string): boolean {
    return this.contextualService.hasState(chatId);
  }
}
