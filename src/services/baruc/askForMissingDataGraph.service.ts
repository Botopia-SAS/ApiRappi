// src/services/baruc/askForMissingDataGraph.service.ts
import { GeminiService } from '../thirtparty/gemini.service';

export interface IntentResponse {
  intencion: 'graficas' | 'mltv' | 'op_zones' | 'saludo' | 'desconocido';
  variable?: 'ordenes' | 'gasto';
  periodo?: number;
  tipo_reporte?: 'semanal' | 'mensual';
}

export class AskForMissingDataGraphService {
  constructor(private gemini: GeminiService) {}

  async checkAndAskForMissingData(intent: IntentResponse): Promise<{ 
    isComplete: boolean; 
    missingField?: string; 
    question?: string; 
  }> {
    // Verificar si faltan datos para gráficas
    if (intent.intencion === 'graficas') {
      if (!intent.variable) {
        const question = await this.askForVariable();
        return { isComplete: false, missingField: 'variable', question };
      }
      
      if (!intent.periodo) {
        const question = await this.askForPeriodo();
        return { isComplete: false, missingField: 'periodo', question };
      }
    }

    return { isComplete: true };
  }

  private async askForVariable(): Promise<string> {
    const prompt = `
Eres un asistente amigable. El usuario quiere generar gráficas pero no especificó qué tipo de datos quiere ver.

Genera una pregunta concisa y amigable para preguntarle si quiere ver gráficas de:
- Órdenes
- gasto

Ejemplos de buenas preguntas:
- "¿Qué tipo de gráficas quieres ver? 📊 (órdenes o gasto)"
- "¿Prefieres ver datos de órdenes o gasto? 📈"

Genera UNA pregunta similar, amigable y directa:
`;

    try {
      const response = await this.gemini.generate(prompt, { temperature: 0.3 });
      return response.trim();
    } catch (error) {
      console.error('Error generando pregunta para variable:', error);
      return '¿Qué tipo de gráficas quieres ver? 📊 (órdenes o gasto)';
    }
  }

  private async askForPeriodo(): Promise<string> {
    const prompt = `
Eres un asistente amigable de análisis de datos de Rappi. El usuario quiere generar gráficas pero no especificó cuántas semanas de datos quiere visualizar.

IMPORTANTE: El período máximo disponible es 4 semanas. El período es acumulativo (incluye hoy, ayer y las semanas solicitadas hacia atrás).

Opciones disponibles:
- 1 semana: Incluye hoy, ayer y semana pasada
- 2 semanas: Incluye hoy, ayer, semana pasada y semana anterior  
- 3 semanas: Incluye hoy, ayer y 3 semanas hacia atrás
- 4 semanas: Incluye hoy, ayer y 4 semanas hacia atrás (máximo disponible)

Siempre se incluyen las órdenes de ayer (ORDERS_Y) automáticamente.

Genera una pregunta concisa para preguntarle cuántas semanas quiere ver, LIMITANDO las opciones a máximo 4 semanas.

Ejemplos de buenas preguntas:
- "¿Cuántas semanas de datos quieres ver? 📅 (1-4 semanas máximo)"
- "¿Qué período prefieres? 🗓️ • 1-2 semanas (reciente) • 3-4 semanas (máximo disponible)"

Genera UNA pregunta que incluya SOLO opciones de 1-4 semanas:
`;

    try {
      const response = await this.gemini.generate(prompt, { temperature: 0.3 });
      return response.trim();
    } catch (error) {
      console.error('Error generando pregunta para período:', error);
      return '¿Cuántas semanas de datos quieres ver? 📅\n• 1-2 semanas (reciente)\n• 3-4 semanas (máximo disponible)';
    }
  }
}