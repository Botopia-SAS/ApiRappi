// src/services/rappi/askForMissingDataMLTV.service.ts
import { GeminiService } from '../thirtparty/gemini.service';
import { IntentResponse } from '../baruc/intentProcessor.service';

export class AskForMissingDataMLTVService {
  constructor(private gemini: GeminiService) {}

  async checkAndAskForMissingData(intent: IntentResponse): Promise<{ 
    isComplete: boolean; 
    missingField?: string; 
    question?: string; 
  }> {
    if (intent.intencion === 'mltv') {
      if (!intent.tipo_reporte) {
        const question = await this.askForTipoReporte();
        return { isComplete: false, missingField: 'tipo_reporte', question };
      }
    }

    return { isComplete: true };
  }

  private async askForTipoReporte(): Promise<string> {
    const prompt = `
Eres un asistente amigable. El usuario quiere un análisis de multiverticalidad (MLTV) pero no especificó el tipo de reporte.

Genera una pregunta concisa y amigable para preguntarle si quiere:
- Reporte semanal
- Reporte mensual

Ejemplos de buenas preguntas:
- "¿Qué tipo de reporte MLTV necesitas? 📊 (semanal o mensual)"
- "¿Prefieres análisis semanal o mensual? 📈"

Genera UNA pregunta similar, amigable y directa:
`;

    try {
      const response = await this.gemini.generate(prompt, { temperature: 0.3 });
      return response.trim();
    } catch (error) {
      console.error('Error generando pregunta para tipo reporte MLTV:', error);
      return '¿Qué tipo de reporte MLTV necesitas? 📊 (semanal o mensual)';
    }
  }
}