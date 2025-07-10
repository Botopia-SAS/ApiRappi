// src/services/rappi/askForMissingDataOpZones.service.ts
import { GeminiService } from '../thirtparty/gemini.service';
import { IntentResponse } from '../baruc/intentProcessor.service';

export class AskForMissingDataOpZonesService {
  constructor(private gemini: GeminiService) {}

  async checkAndAskForMissingData(intent: IntentResponse): Promise<{ 
    isComplete: boolean; 
    missingField?: string; 
    question?: string; 
  }> {
    if (intent.intencion === 'op_zones') {
      if (!intent.tipo_reporte) {
        const question = await this.askForTipoReporte();
        return { isComplete: false, missingField: 'tipo_reporte', question };
      }
    }

    return { isComplete: true };
  }

  private async askForTipoReporte(): Promise<string> {
    const prompt = `
Eres un asistente amigable. El usuario quiere un análisis de zonas operativas (OP ZONES) pero no especificó el tipo de reporte.

Genera una pregunta concisa y amigable para preguntarle si quiere:
- Reporte semanal
- Reporte mensual

Ejemplos de buenas preguntas:
- "¿Qué tipo de análisis de zonas necesitas? 🗺️ (semanal o mensual)"
- "¿Prefieres reporte semanal o mensual de las zonas? 📊"

Genera UNA pregunta similar, amigable y directa:
`;

    try {
      const response = await this.gemini.generate(prompt, { temperature: 0.3 });
      return response.trim();
    } catch (error) {
      console.error('Error generando pregunta para tipo reporte OP ZONES:', error);
      return '¿Qué tipo de análisis de zonas necesitas? 🗺️ (semanal o mensual)';
    }
  }
}