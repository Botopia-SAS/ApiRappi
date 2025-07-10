// src/services/baruc/charts.service.ts
import { MessageMedia } from 'whatsapp-web.js';
import { GoogleSheetsService } from '../thirtparty/googleSheets.service';
import { CloudinaryService } from '../thirtparty/cloudinary.service';
import fetch from 'node-fetch';
import { GRAFICAS_ENDPOINT_URL } from '../../config';

// ✅ AGREGAR: Definir el tipo ChartData
interface ChartData {
  url: string;
  title: string;
  country: string;
  type: string;
  period: number;
}

export class ChartsService {
  private static instance: ChartsService;
  
  public static getInstance(): ChartsService {
    if (!ChartsService.instance) {
      ChartsService.instance = new ChartsService();
    }
    return ChartsService.instance;
  }

  async generateCharts(tipo: string, periodo: number = 4): Promise<ChartData[]> {
    try {
      console.log(`📊 Iniciando generación de gráficas - Tipo: ${tipo}, Período: ${periodo} semanas (acumulativo)`);
      
      // Validar período máximo
      const validatedPeriodo = this.validatePeriodo(periodo);
      
      // Obtener datos con lógica acumulativa que incluye ORDERS_Y
      const googleSheetsService = GoogleSheetsService.getInstance();
      const csvData = await googleSheetsService.getDataAsCSV(validatedPeriodo, true); // true = incluir ORDERS_Y
      
      // Subir CSV a Cloudinary
      const cloudinaryService = CloudinaryService.getInstance();
      const csvUrl = await cloudinaryService.uploadCsv(csvData, `data_${tipo}_${validatedPeriodo}w_cumulative_${Date.now()}.csv`);
      
      console.log(`☁️ CSV subido a Cloudinary: ${csvUrl}`);

      // Preparar payload para microservicio
      const payload = {
        csv_url: csvUrl,
        tipo: tipo,
        periodo: validatedPeriodo,
        cumulative: true, // Indicar que es acumulativo
        include_orders_y: true, // Siempre incluir ORDERS_Y
        descripcion: `Gráficas ${tipo} - ${validatedPeriodo} semana${validatedPeriodo > 1 ? 's' : ''} (acumulativo + ORDERS_Y)`
      };

      console.log('📤 Enviando request al microservicio:', payload);

      const response = await fetch(process.env.GRAFICAS_ENDPOINT_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error del microservicio:', errorText);
        throw new Error(`Error del microservicio: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('📥 Respuesta del microservicio:', result);

      // Extraer URLs de las imágenes
      const imageUrls = result.image_urls || this.extractImageUrls(JSON.stringify(result));
      
      if (!imageUrls || imageUrls.length === 0) {
        throw new Error('No se generaron imágenes');
      }

      console.log(`🖼️ Se generaron ${imageUrls.length} gráficas`);

      // Convertir URLs a objetos ChartData
      const chartData: ChartData[] = imageUrls.map((url: string, index: number) => ({
        url: url,
        title: `${tipo} - Semana ${validatedPeriodo} (Acumulativo)`,
        country: `País ${index + 1}`,
        type: tipo,
        period: validatedPeriodo
      }));

      return chartData;

    } catch (error) {
      console.error('❌ Error generando gráficas:', error);
      throw error;
    }
  }

  private extractImageUrls(responseBody: string): string[] {
    try {
      const urlPattern = /https?:\/\/[^\s"',\]]+\.(?:png|jpg|jpeg|gif|webp)/gi;
      const urls = responseBody.match(urlPattern) || [];
      
      console.log(`🔍 URLs extraídas del response: ${urls.length}`);
      return urls;
    } catch (e) {
      console.error('Error extrayendo URLs:', e);
      return [];
    }
  }

  async convertUrlsToMedia(imageUrls: string[]): Promise<MessageMedia[]> {
    console.log(`🔄 Convirtiendo ${imageUrls.length} URLs a objetos MessageMedia`);
    
    const mediaPromises = imageUrls.map(async (url, index) => {
      try {
        console.log(`📥 Descargando imagen ${index + 1}/${imageUrls.length}: ${url}`);
        const media = await MessageMedia.fromUrl(url);
        console.log(`✅ Imagen ${index + 1} convertida exitosamente`);
        return media;
      } catch (error) {
        console.error(`❌ Error convirtiendo imagen ${index + 1}:`, error);
        return null;
      }
    });

    const mediaResults = await Promise.all(mediaPromises);
    const validMedia = mediaResults.filter((media): media is MessageMedia => media !== null);
    
    console.log(`✅ ${validMedia.length}/${imageUrls.length} imágenes convertidas exitosamente`);
    
    return validMedia;
  }

  // Método auxiliar para validar el período (máximo 4 semanas)
  validatePeriodo(periodo: number): number {
    if (periodo < 1) {
      console.log('⚠️ Período mínimo es 1 semana');
      return 1;
    }
    if (periodo > 4) {
      console.log(`⚠️ Período limitado de ${periodo} a 4 semanas (máximo disponible)`);
      return 4;
    }
    return periodo;
  }
}