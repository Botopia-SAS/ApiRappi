export enum Stage {
  WAIT_GRAPH = 'WAIT_GRAPH',
  WAIT_TYPE  = 'WAIT_TYPE'
}

const BARUC_WORDS    = ['baruc'];
const GRAF_WORDS     = ['graficas','gráficas'];
const TYPE_ORDERS    = ['ordenes','órdenes'];
const TYPE_EXPENSES  = ['gastos'];
const NO_WORDS       = ['no','nop','nope','cancelar','nada'];

function includesAny(text: string, list: string[]) {
  return list.some(w => text.includes(w));
}

export class ConversationService {
  private state = new Map<string, Stage>();

  hasState(chatId: string): boolean {
    return this.state.has(chatId);
  }

  /**  
   * Dado un mensaje raw, devuelve la respuesta o null si no toca  
   */
  handle(chatId: string, raw: string): string | null {
    const text     = raw.trim().toLowerCase();
    const hasBaruc = includesAny(text, BARUC_WORDS);
    const hasGraf  = includesAny(text, GRAF_WORDS);
    const hasOrd   = includesAny(text, TYPE_ORDERS);
    const hasGas   = includesAny(text, TYPE_EXPENSES);
    const hasNo    = includesAny(text, NO_WORDS);

    // Si están todas las claves en un solo mensaje → respuesta final
    if (hasBaruc && hasGraf && (hasOrd || hasGas)) {
      this.state.delete(chatId);
      return hasOrd
        ? 'Baruc hará las gráficas de órdenes por ti 📊'
        : 'Baruc hará las gráficas de gastos por ti 💰';
    }

    // Si detecta “no” y hay flujo abierto → cancelar
    if (hasNo && this.hasState(chatId)) {
      this.state.delete(chatId);
      return 'Entendido, cancelé el flujo.';
    }

    // Sin “baruc” y sin estado → no intervenimos
    if (!hasBaruc && !this.hasState(chatId)) {
      return null;
    }

    // Continuamos o arrancamos el flujo
    const stage = this.state.get(chatId) ?? Stage.WAIT_GRAPH;
    switch (stage) {
      case Stage.WAIT_GRAPH:
        if (hasGraf) {
          this.state.set(chatId, Stage.WAIT_TYPE);
          return '¡Genial! ¿Qué tipo de gráficas quieres, “órdenes” o “gastos”?';
        }
        this.state.set(chatId, Stage.WAIT_GRAPH);
        return '¿Quieres que haga las gráficas?';

      case Stage.WAIT_TYPE:
        if (hasOrd || hasGas) {
          this.state.delete(chatId);
          return hasOrd
            ? 'Baruc hará las gráficas de órdenes por ti 📊'
            : 'Baruc hará las gráficas de gastos por ti 💰';
        }
        return 'Por favor dime “órdenes” o “gastos” para continuar.';
    }
  }
}