// src/services/mltv.service.ts
import { GeminiService } from '../thirtparty/gemini.service';
import { GoogleSheetsService } from '../thirtparty/googleSheets.service';

export class MLTVService {
  constructor(
    private gemini: GeminiService,
    private sheetsService: GoogleSheetsService
  ) {}

  async generateAnalysis(): Promise<string> {
    try {
      const mltvData = await this.sheetsService.getMLTVDataForAnalysis();
      console.log(`>>> Datos de MLTV preparados. Longitud: ${mltvData.length} caracteres.`);
      
      const { lastWeekStr, analysisPrompt } = this.buildAnalysisPrompt(mltvData);
      
      console.log('>>> Prompt enviado a Gemini (MLTV):');
      console.log(analysisPrompt);

      const analysis = await this.gemini.generate(analysisPrompt, { temperature: 0.3 });

      console.log('<<< Respuesta recibida de Gemini (MLTV):');
      console.log(analysis);

      return `📊 **REPORTE MLTV**\n**Semana analizada: ${lastWeekStr}**\n\n${analysis}`;
    } catch (error) {
      console.error('Error en análisis MLTV:', error);
      throw error;
    }
  }

  private buildAnalysisPrompt(mltvData: string) {
    const { lastWeekStart, lastWeekEnd, prevWeekStart, prevWeekEnd } = this.calculateDates();
    
    const format = (date: Date) =>
      date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    
    const lastWeekStr = `${format(lastWeekStart)} al ${format(lastWeekEnd)}`;
    
    const analysisPrompt = `
Eres un analista de datos de Rappi. Genera un reporte semanal para el equipo, en formato de mensaje de WhatsApp, usando los datos proporcionados de MLTV.

REQUISITOS:
- Compara la última semana cerrada (${format(lastWeekStart)} a ${format(lastWeekEnd)}) contra la semana anterior (${format(prevWeekStart)} a ${format(prevWeekEnd)}).
- Segmenta el análisis por tipo de zona (0 y 2), país y ciudad.
- Muestra la variación WoW (week over week) de bases de usuarios y de órdenes para cada país y zona.
- Incluye un resumen de crecimiento o caída por país y zona.
- Presenta el top 3 ciudades por volumen para cada país y zona.
- Usa emojis de banderas para países y bullets para separar secciones.
- Usa un saludo inicial breve y amigable.
- Usa títulos claros para cada sección (ej: "🔹 Zonas 0", "🔹 Zonas 2", "📍Top ciudades por volumen").
- Sé conciso, máximo 350 palabras.
- Si falta información para algún país o zona, indícalo brevemente.

DATOS:
${mltvData}

EJEMPLO DE FORMATO ESPERADO:

Hola Team! ¿Cómo están?

📊 Actualización semanal - Zonas
Comparativo semana cerrada del 16 de junio vs LW

🔹 Zonas 0

Variación WoW de bases:
🇦🇷 AR: +0.52%
🇨🇱 CL: +0.18%
...

🔸 Órdenes:
Zonas 0 mostraron crecimiento en 🇨🇴 CO (+5.2%) y 🇦🇷 AR (+2.7%), mientras 🇨🇱 CL presentó una leve baja (-0.4%).

📍Top ciudades por volumen:
🇦🇷 AR: Buenos Aires (6k), Neuquén (3k), Mar del Plata (3k)
...

🔹 Zonas 2

Variación WoW de bases:
🇦🇷 AR: +0.30%
...

🔸 Órdenes:
AR crece un +4.6%, mientras CL cae un -4.0%.

📍Top ciudades por volumen:
🇦🇷 AR: Buenos Aires (530k), Córdoba (37k), La Plata (25k)
...

Recuerda seguir este formato y estructura, adaptando los datos reales.
`;

    return { lastWeekStr, analysisPrompt };
  }

  private calculateDates() {
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay() + 1);
    
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7);
    
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6);

    const prevWeekEnd = new Date(lastWeekStart);
    prevWeekEnd.setDate(lastWeekStart.getDate() - 1);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekEnd.getDate() - 6);

    return { lastWeekStart, lastWeekEnd, prevWeekStart, prevWeekEnd };
  }
}