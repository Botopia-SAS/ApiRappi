// src/services/baruc/intentProcessor.service.ts
import { GeminiService } from '../thirtparty/gemini.service';

export interface IntentResponse {
  intencion: 'graficas' | 'mltv' | 'op_zones' | 'saludo' | 'desconocido';
  variable?: 'ordenes' | 'gastos';
  periodo?: number;
  tipo_reporte?: 'semanal' | 'mensual';
}

export class IntentProcessorService {
  constructor(private gemini: GeminiService) {}

  async processUserMessage(message: string): Promise<IntentResponse> {
    const prompt = `
Eres un asistente de análisis de datos de Rappi. Analiza el siguiente mensaje del usuario y devuelve un JSON con la intención y parámetros extraídos.

INTENCIONES DISPONIBLES:
- "graficas": El usuario quiere generar gráficas/charts
- "mltv": El usuario quiere análisis de multiverticalidad  
- "op_zones": El usuario quiere análisis de zonas operativas
- "saludo": El usuario solo saluda o dice "baruc"
- "desconocido": No se puede determinar la intención

PARA GRÁFICAS:
- variable: "ordenes" o "gastos" (null si no se especifica)
- periodo: número de semanas a graficar (1-4 MÁXIMO, null si no se especifica)
  * IMPORTANTE: El período es acumulativo - incluye hoy, ayer y las semanas hacia atrás
  * Cada período representa columnas adicionales en el dataset
  * Ejemplos: "2 semanas" = 2, "3 semanas" = 3, "1 mes" = 4, "último mes" = 4
  * Si el usuario pide más de 4 semanas, limitar automáticamente a 4
  * Si pide "trimestre", "3 meses", etc. también limitar a 4

PARA ANÁLISIS:
- tipo_reporte: "semanal" o "mensual" (null si no se especifica)

EJEMPLOS:
Usuario: "Baruc me ayudas con tabla de órdenes"
Respuesta: {"intencion":"graficas","variable":"ordenes","periodo":null}

Usuario: "Baruc gráficas de gastos de 2 semanas"
Respuesta: {"intencion":"graficas","variable":"gastos","periodo":2}

Usuario: "Baruc gráficas de órdenes del último mes"
Respuesta: {"intencion":"graficas","variable":"ordenes","periodo":4}

Usuario: "Baruc gráficas de 8 semanas de gastos"
Respuesta: {"intencion":"graficas","variable":"gastos","periodo":4}

Usuario: "Baruc gráficas del trimestre"
Respuesta: {"intencion":"graficas","variable":null,"periodo":4}

Usuario: "3"
Respuesta: {"intencion":"graficas","variable":null,"periodo":3}

Usuario: "Baruc análisis MLTV"
Respuesta: {"intencion":"mltv","tipo_reporte":null}

Usuario: "Baruc"
Respuesta: {"intencion":"saludo"}

Usuario: "Baruc reporte de zones"  
Respuesta: {"intencion":"op_zones","tipo_reporte":null}

MENSAJE DEL USUARIO: "${message}"

Devuelve SOLO el JSON válido, sin comentarios ni explicaciones:
`;

    try {
      const response = await this.gemini.generate(prompt, { temperature: 0.1 });
      const cleanResponse = response.trim();
      
      // Limpiar markdown si está presente
      const jsonText = cleanResponse.startsWith('```json') 
        ? cleanResponse.slice(7, -3).trim()
        : cleanResponse;
      
      const parsed = JSON.parse(jsonText);
      
      // ✅ VALIDAR Y LIMITAR EL PERÍODO ESTRICTAMENTE A 4 SEMANAS MÁXIMO
      if (parsed.periodo && typeof parsed.periodo === 'number') {
        if (parsed.periodo < 1) {
          console.log(`⚠️ Período ajustado de ${parsed.periodo} a 1 semana (mínimo)`);
          parsed.periodo = 1;
        } else if (parsed.periodo > 4) {
          console.log(`⚠️ Período limitado de ${parsed.periodo} a 4 semanas (máximo disponible)`);
          parsed.periodo = 4;
        }
      }
      
      console.log('✅ Intent procesado:', parsed);
      return parsed;
      
    } catch (error) {
      console.error('Error procesando intent:', error);
      return { intencion: 'desconocido' };
    }
  }
}