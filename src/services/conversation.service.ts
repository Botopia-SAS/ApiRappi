import { GeminiService } from './gemini.service';

export enum Stage {
  WAIT_GRAPH = 'WAIT_GRAPH',
  WAIT_TYPE  = 'WAIT_TYPE'
}

const BARUC_WORDS    = ['baruc'];
const GRAF_WORDS     = ['graficas','gráficas','gráfica','grafica'];
const TYPE_ORDERS    = ['ordenes','órdenes','orden','hoy','órden'];
const TYPE_EXPENSES  = ['gastos'];
const NO_WORDS       = ['no','nop','nope','cancelar','nada','olvídalo','olvidar','olvidalo','no quiero','no quiero nada'];
const AFFIRMATIVE_WORDS = ['si', 'sí', 'claro', 'por supuesto', 'ok'];

function includesAny(text: string, list: string[]) {
  return list.some(w => text.includes(w));
}

export class ConversationService {
  private state = new Map<string, Stage>();

  constructor(private gemini: GeminiService) {}

  hasState(chatId: string): boolean {
    return this.state.has(chatId);
  }

  async handle(chatId: string, raw: string): Promise<string | null> {
    const text = raw.trim().toLowerCase();

    // Si ya hay un flujo activo, procesamos según la etapa sin requerir "baruc"
    if (this.hasState(chatId)) {
      const hasGraf = includesAny(text, GRAF_WORDS);
      const hasOrd = includesAny(text, TYPE_ORDERS);
      const hasGas = includesAny(text, TYPE_EXPENSES);
      const hasAffirmative = includesAny(text, AFFIRMATIVE_WORDS);
      const hasNo = includesAny(text, NO_WORDS);
      const stage = this.state.get(chatId)!;
      switch (stage) {
        case Stage.WAIT_GRAPH:
          if (hasGraf && (hasOrd || hasGas)) {
            this.state.delete(chatId);
            return hasOrd
              ? 'Haré las gráficas de órdenes por ti, dame un minuto 📊'
              : 'Haré las gráficas de gastos por ti, dame un minuto 💰';
          }
          if (hasGraf || hasAffirmative) {
            this.state.set(chatId, Stage.WAIT_TYPE);
            return '¿De órdenes o de gasto?';
          }
          if (hasNo) {
            this.state.delete(chatId);
            return 'Entendido, cancelé el flujo.';
          }
          return 'Por favor, dime si deseas gráficas.';
        case Stage.WAIT_TYPE:
          if (hasOrd || hasGas) {
            this.state.delete(chatId);
            return hasOrd
              ? 'Haré las gráficas de órdenes por ti, dame un minuto 📊'
              : 'Haré las gráficas de gastos por ti, dame un minuto 💰';
          }

          return 'Por favor, especifica: "órdenes" o "gasto".';
      }
    } else {
      // No hay flujo activo: iniciar si se menciona "baruc"
      if (text.includes('baruc')) {
        // Si además se solicitan gráficas y se menciona "hoy"
        // y no se especifica tipo (ordenes o gastos), asumimos órdenes.
        if (includesAny(text, GRAF_WORDS) && text.includes('hoy') &&
            !includesAny(text, TYPE_ORDERS) && !includesAny(text, TYPE_EXPENSES)) {
          return 'Haré las gráficas de órdenes por ti, dame un minuto 📊';
        }
        this.state.set(chatId, Stage.WAIT_GRAPH);
        try {
          const prompt = `Genera un saludo serio pero amigable y natural como asistente, preguntando en qué puedes ayudar. Máximo 2 frases cortas. Incluye un solo emoji relevante. Ejemplo: "Aquí estoy! ¿En qué puedo ayudarte? 😊"`;
          const response = await this.gemini.generate(prompt);
          return response || 'Aquí estoy! ¿En qué puedo ayudar? 😊';
        } catch (err) {
          console.error('[Conv] Error al generar saludo:', err);
          return 'Aquí estoy! ¿En qué puedo ayudarte? 😊';
        }
      } else {
      }
    }
    return null;
  }
}
