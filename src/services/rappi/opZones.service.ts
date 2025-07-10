// src/services/opZones.service.ts
import { GeminiService } from '../thirtparty/gemini.service';
import { GoogleSheetsService } from '../thirtparty/googleSheets.service';

export class OpZonesService {
  constructor(
    private gemini: GeminiService,
    private sheetsService: GoogleSheetsService
  ) {}

  async generateAnalysis(): Promise<string> {
    try {
      const analysisData = await this.sheetsService.getOpZonesAnalysis();
      console.log('>>> Datos de OP ZONES ya procesados y calculados.');

      const analysisPrompt = this.buildAnalysisPrompt(analysisData);
      const analysis = await this.gemini.generate(analysisPrompt, { temperature: 0.1 });

      console.log('<<< Respuesta formateada recibida de Gemini:');
      console.log(analysis);

      return analysis;
    } catch (error) {
      console.error('Error en análisis OP ZONES:', error);
      throw error;
    }
  }

  private buildAnalysisPrompt(analysisData: any): string {
    return `
Eres un analista de datos de Rappi. Te daré un objeto JSON con los resultados del análisis semanal de OP ZONES.
Tu única tarea es formatear estos datos en un reporte amigable para WhatsApp, siguiendo el ejemplo.

REQUISITOS DEL FORMATO:
- Usa un saludo inicial breve y amigable.
- El título debe ser "📊 Actualización semanal - Zonas".
- Separa el reporte en "🔹 Zonas 0" y "🔹 Zonas 2".
- Para cada zona, lista la "Variación WoW de bases" y luego las "Órdenes" por país.
- Usa emojis de banderas para cada país (🇦🇷, 🇨🇱, 🇨🇴, 🇪🇨, 🇲🇽, 🇵🇪, 🇺🇾).
- Muestra los porcentajes de variación WoW con dos decimales.
- Incluye una sección "📍Top ciudades por volumen" para cada zona.
- Si para un país o zona no hay datos en el JSON, no lo incluyas en el reporte.
- Sé conciso y claro.

DATOS JSON (ya calculados):
${JSON.stringify(analysisData, null, 2)}

EJEMPLO DE FORMATO DE SALIDA:

Hola Team! ¿Cómo están?

📊 Actualización semanal - Zonas

🔹 Zonas 0
Variación WoW de bases:
🇦🇷 AR: +0.52%
...
🔸 Órdenes:
🇨🇴 CO: +5.20%
...
📍Top ciudades por volumen:
🇦🇷 AR: Buenos Aires (6k), Neuquén (3k)
...

🔹 Zonas 2
...
`;
  }
}