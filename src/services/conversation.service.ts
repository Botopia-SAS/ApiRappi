import { GeminiService } from './gemini.service';

export enum Stage {
  WAIT_GRAPH = 'WAIT_GRAPH',
  WAIT_TYPE  = 'WAIT_TYPE'
}

const BARUC_WORDS    = ['baruc', 'Baruc', 'BARUC'];
const GRAF_WORDS     = ['graficas','gráficas','gráfica','grafica','curvas','curva','cúrvas','cúrva','curba','curbas','cúrbas','cúrba'];
const TYPE_ORDERS    = ['ordenes','órdenes','hoy','Hoy','ordenes de hoy','órdenes de hoy','ordenes del día','órdenes del día'];
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

  /**  
   * Dado un mensaje raw, devuelve la respuesta o null si no interviene  
   */
  async handle(chatId: string, raw: string): Promise<string | null> {
    const text = raw.trim().toLowerCase();

    // Si el mensaje es exactamente "baruc", inicia la conversación con un saludo
    if (text === 'baruc') {
      this.state.set(chatId, Stage.WAIT_GRAPH);
      try {
        const prompt = `Genera un saludo serio pero amigable y natural como asistente, preguntando en qué puedes ayudar. 
          Máximo 2 frases cortas. Incluye algún un solo emoji relevante.
          Ejemplo: "Aquí estoy! ¿En qué puedo ayudarte? 😊"`;
        const response = await this.gemini.generate(prompt);
        return response || 'Aquí estoy! ¿En qué puedo? 😊'; // fallback por si falla
      } catch (err) {
        console.error('Error generando saludo:', err);
        return 'Aquí estoy! ¿En qué puedo ayudarte? 😊';
      }
    }

    const hasBaruc = includesAny(text, BARUC_WORDS);
    const hasGraf  = includesAny(text, GRAF_WORDS);
    const hasOrd   = includesAny(text, TYPE_ORDERS);
    const hasGas   = includesAny(text, TYPE_EXPENSES);
    const hasNo    = includesAny(text, NO_WORDS);
    const hasAffirmative = includesAny(text, AFFIRMATIVE_WORDS);

    // Si se incluye todo en un solo mensaje (con "baruc") → respuesta definitiva
    if (hasBaruc && hasGraf && (hasOrd || hasGas)) {
      this.state.delete(chatId);
      return hasOrd
        ? 'Haré las gráficas de órdenes por ti, dame un minuto 📊'
        : 'Haré las gráficas de gastos por ti, dame un minuto 💰';
    }

    // Cancelar el flujo si se detecta un "no" y hay conversación abierta
    if (hasNo && this.hasState(chatId)) {
      this.state.delete(chatId);
      return 'Entendido, cancelé el flujo.';
    }

    // Si ya hay un flujo en curso, proceder según la etapa
    if (this.hasState(chatId)) {
      const stage = this.state.get(chatId)!;
      switch (stage) {
        case Stage.WAIT_GRAPH:
          // Si además del trigger "gráficas" ya se incluye el tipo, responde de forma definitiva
          if (hasGraf && (hasOrd || hasGas)) {
            this.state.delete(chatId);
            return hasOrd
              ? 'Haré las gráficas de órdenes por ti, dame un minuto 📊'
              : 'Haré las gráficas de gastos por ti, dame un minuto 💰';
          }
          // Si se detecta "gráficas", cambia de etapa
          if (hasGraf) {
            this.state.set(chatId, Stage.WAIT_TYPE);
            return '¿De órdenes o de gasto?';
          }
          // Nueva lógica: si se responde afirmativamente, asumimos que se desean gráficas
          if (hasAffirmative) {
            this.state.set(chatId, Stage.WAIT_TYPE);
            return '¿De órdenes o de gasto?';
          }
          return 'Por ahora solo tengo información para hacer gráficas de órdenes en tiempo real Por favor dime "gráficas" para continuar.';

        case Stage.WAIT_TYPE:
          if (hasOrd || hasGas) {
            this.state.delete(chatId);
            return hasOrd
              ? 'haré las gráficas de órdenes por ti, dame un minuto 📊'
              : 'haré las gráficas de gastos por ti, dame un minuto 💰';
          }
          return 'Por favor, especifica: "órdenes" o "gasto".';
      }
    }

    // Inicia el flujo si se menciona "baruc" en cualquier otro contexto
    if (hasBaruc) {
      this.state.set(chatId, Stage.WAIT_GRAPH);
      return 'Aquí estoy, ¿en qué puedo ayudarte?';
    }

    return null;
  }
}
