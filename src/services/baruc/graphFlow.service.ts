import { GeminiService } from '../thirtparty/gemini.service';

export class GraphFlowService {
  constructor(private gemini: GeminiService) {}

  async processFlow(message: string): Promise<string> {
    console.log('[GraphFlow] Procesando mensaje:', message);
    const contextData = await this.contextIdentifier(message);
    console.log('[GraphFlow] contextIdentifier retorna:', contextData);
    if (contextData.CONTEXT === 'GRAPH') {
      let graphInfo = await this.graphGenerator(message);
      console.log('[GraphFlow] graphGenerator retorna inicialmente:', graphInfo);
      // Bucle para solicitar datos faltantes si VARIABLE no se ha rellenado
      while (!graphInfo.VARIABLE) {
        console.log('[GraphFlow] VARIABLE faltante. Solicitando dato faltante...');
        const missingQuestion = await this.askForMissingDataGraph("tipo");
        console.log('[GraphFlow] Pregunta generada para dato faltante:', missingQuestion);
        // Simulamos que el usuario responde concatenando la respuesta al mensaje
        message += ` ${missingQuestion}`;
        graphInfo = await this.graphGenerator(message);
        console.log('[GraphFlow] graphGenerator retorna actualizado:', graphInfo);
      }
      if (graphInfo.VARIABLE === 'ORDERS') {
        return 'Haré las gráficas de órdenes por ti, dame un minuto 📊';
      } else if (graphInfo.VARIABLE === 'EXPENSES') {
        return 'Haré las gráficas de gastos por ti, dame un minuto 💰';
      } else {
        return 'No se pudo determinar el tipo de gráfica.';
      }
    }
    return '';
  }

  async contextIdentifier(message: string): Promise<{ CONTEXT: string }> {
    const prompt = `Analiza el siguiente mensaje y devuelve un JSON sin comentarios con la siguiente estructura:
{
    "CONTEXT": ""
}
Solo devuelve JSON válido. Mensaje: "${message}"`;
    try {
      let response = await this.gemini.generate(prompt, { temperature: 0 });
      console.log('[GraphFlow] contextIdentifier respuesta cruda:', response);
      // Limpiar markdown si está presente
      response = response.trim();
      if (response.startsWith('```json')) {
        response = response.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      }
      return JSON.parse(response);
    } catch (err) {
      console.error('[GraphFlow] Error en contextIdentifier:', err);
      return { CONTEXT: "" };
    }
  }

  async graphGenerator(message: string): Promise<{ CONTEXT: string; VARIABLE?: string }> {
    const prompt = `Analiza el siguiente mensaje y devuelve un JSON sin comentarios con la siguiente estructura:
{
    "CONTEXT": "GRAPH",
    "VARIABLE": "" // "ORDERS" o "EXPENSES" o vacío si falta información
}
Solo devuelve JSON válido. Mensaje: "${message}"`;
    try {
      let response = await this.gemini.generate(prompt, { temperature: 0 });
      console.log('[GraphFlow] graphGenerator respuesta cruda:', response);
      // Limpiar posibles delimitadores markdown
      response = response.trim();
      if (response.startsWith('```json')) {
        response = response.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      }
      return JSON.parse(response);
    } catch (err) {
      console.error('[GraphFlow] Error en graphGenerator:', err);
      return { CONTEXT: "GRAPH" };
    }
  }

  async askForMissingDataGraph(missingVariable: string): Promise<string> {
    const prompt = `Como asistente, necesito más información para generar la gráfica. Por favor, formula una pregunta concisa para solicitar el valor de "${missingVariable}" necesario para generar la gráfica.`;
    try {
      const response = await this.gemini.generate(prompt);
      console.log('[GraphFlow] askForMissingDataGraph respuesta:', response);
      return response;
    } catch (err) {
      console.error('[GraphFlow] Error en askForMissingDataGraph:', err);
      return '';
    }
  }
}