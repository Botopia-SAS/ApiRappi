import { google, sheets_v4 } from 'googleapis';

export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    this.sheets = google.sheets({ version: 'v4', auth: apiKey });
  }

  async getDataAsCSV(): Promise<string> {
    try {
      // Obtener datos de la hoja
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'Sheet1!A:Z', // Ajusta el rango según tus necesidades
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No data found in spreadsheet');
      }

      // Convertir los datos a formato CSV
      const csvRows = rows.map(row => 
        row.map(cell => 
          // Escapar comillas y envolver en comillas si es necesario
          typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        ).join(',')
      );

      return csvRows.join('\n');

    } catch (error) {
      console.error('Error getting spreadsheet data:', error);
      throw error;
    }
  }

  /**
   * Obtiene todas las hojas que contienen "MLTV" en el nombre
   */
  async getMLTVSheets(): Promise<{ name: string; data: any[][] }[]> {
    try {
      // Primero obtenemos la metadata del spreadsheet para ver todas las hojas
      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      });

      const sheets = metadata.data.sheets || [];
      const mltvSheets = sheets.filter(sheet => 
        sheet.properties?.title?.includes('MLTV') || 
        sheet.properties?.title?.includes('mltv')
      );

      console.log(`Found ${mltvSheets.length} MLTV sheets:`, 
        mltvSheets.map(s => s.properties?.title)
      );

      // Obtener datos de cada hoja MLTV
      const results = [];
      for (const sheet of mltvSheets) {
        const sheetName = sheet.properties?.title;
        if (!sheetName) continue;

        try {
          const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
            range: `'${sheetName}'!A:Z`,
          });

          if (response.data.values && response.data.values.length > 0) {
            results.push({
              name: sheetName,
              data: response.data.values
            });
          }
        } catch (error) {
          console.error(`Error getting data from sheet ${sheetName}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Error getting MLTV sheets:', error);
      throw error;
    }
  }

  /**
   * Convierte los datos de múltiples hojas MLTV a formato de texto para análisis (OPTIMIZADO)
   */
  async getMLTVDataForAnalysis(): Promise<string> {
    const mltvSheets = await this.getMLTVSheets();
    
    if (mltvSheets.length === 0) {
      throw new Error('No MLTV sheets found');
    }

    let analysisText = 'DATOS DE MULTIVERTICALIDAD (MLTV) PARA ANÁLISIS:\n\n';
    
    // Información temporal más concisa
    const today = new Date();
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - today.getDay() + 1 - 7);
    
    analysisText += `BUSCAR: Datos de semana ${lastWeekStart.toLocaleDateString('es-ES')}\n\n`;
    
    // LIMITAR DATOS
    const MAX_ROWS_PER_SHEET = 1000; // Menos filas para MLTV
    const MAX_CHARS = 8000;
    
    mltvSheets.forEach(sheet => {
      if (analysisText.length > MAX_CHARS) return;
      
      analysisText += `=== HOJA: ${sheet.name} ===\n`;
      
      // Limitar filas
      const limitedData = sheet.data.slice(0, MAX_ROWS_PER_SHEET);
      
      limitedData.forEach((row, index) => {
        if (analysisText.length > MAX_CHARS) return;
        
        if (index === 0) {
          // Headers limitados
          const limitedHeaders = row.slice(0, 8);
          analysisText += `COLUMNAS: ${limitedHeaders.join(' | ')}\n`;
          analysisText += '-'.repeat(40) + '\n';
        } else {
          // Data rows limitados y filtrados
          const limitedRow = row.slice(0, 8);
          const hasData = limitedRow.some(cell => cell && cell.toString().trim() !== '');
          
          if (hasData) {
            // Detectar fechas
            const hasDate = limitedRow.some(cell => 
              cell && cell.toString().match(/\d{1,2}\/\d{1,2}/)
            );
            
            const prefix = hasDate ? '[FECHA] ' : '';
            analysisText += `${prefix}${limitedRow.join(' | ')}\n`;
          }
        }
      });
      
      const totalRows = sheet.data.length;
      if (totalRows > MAX_ROWS_PER_SHEET) {
        analysisText += `\n[Procesadas ${MAX_ROWS_PER_SHEET} de ${totalRows} filas]\n`;
      }
      
      analysisText += '\n';
    });

    // Truncar si es muy largo
    if (analysisText.length > MAX_CHARS) {
      analysisText = analysisText.substring(0, MAX_CHARS) + '\n\n[DATOS TRUNCADOS]';
    }

    console.log(`Datos MLTV preparados: ${analysisText.length} caracteres`);
    return analysisText;
  }

  /**
   * Obtiene todas las hojas que contienen "OP ZONES" en el nombre (OPTIMIZADO)
   */
  async getOpZonesSheets(): Promise<{ name: string; data: any[][] }[]> {
    try {
      // Primero obtenemos la metadata del spreadsheet para ver todas las hojas
      const metadata = await this.sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      });

      const sheets = metadata.data.sheets || [];
      const opZonesSheets = sheets.filter(sheet => 
        sheet.properties?.title?.includes('OP ZONES') || 
        sheet.properties?.title?.includes('op zones') ||
        sheet.properties?.title?.includes('ZONES') ||
        sheet.properties?.title?.toLowerCase().includes('zones')
      );

      console.log(`Found ${opZonesSheets.length} OP ZONES sheets:`, 
        opZonesSheets.map(s => s.properties?.title)
      );

      // Obtener datos de cada hoja OP ZONES (LIMITADO A 2000 FILAS)
      const results = [];
      for (const sheet of opZonesSheets) {
        const sheetName = sheet.properties?.title;
        if (!sheetName) continue;

        try {
          // Limitar el rango a las primeras 2000 filas (A1:Z2000)
          const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
            range: `'${sheetName}'!A1:Z2000`,
          });

          if (response.data.values && response.data.values.length > 0) {
            results.push({
              name: sheetName,
              data: response.data.values
            });
            console.log(`Cargadas ${response.data.values.length} filas de la hoja: ${sheetName}`);
          }
        } catch (error) {
          console.error(`Error getting data from sheet ${sheetName}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Error getting OP ZONES sheets:', error);
      throw error;
    }
  }

  /**
   * Convierte los datos de múltiples hojas OP ZONES a formato de texto para análisis (OPTIMIZADO - 2000 filas)
   */
  async getOpZonesDataForAnalysis(): Promise<string> {
    const opZonesSheets = await this.getOpZonesSheets();
    
    if (opZonesSheets.length === 0) {
      throw new Error('No OP ZONES sheets found');
    }

    let analysisText = 'DATOS DE OP ZONES PARA ANÁLISIS:\n\n';
    
    // Añadir información temporal
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay() + 1); 
    
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7); 
    
    analysisText += `COMPARAR: Semana actual vs anterior\n\n`;
    
    // PROCESAR SOLO LAS PRIMERAS 2000 FILAS POR HOJA
    const MAX_ROWS_PER_SHEET = 2000;
    const MAX_CHARS = 10000; // Límite de caracteres para evitar exceso de tokens
    
    opZonesSheets.forEach((sheet, sheetIndex) => {
      // Si ya tenemos demasiado texto, parar
      if (analysisText.length > MAX_CHARS) {
        analysisText += `[Más hojas disponibles pero limitadas por capacidad de procesamiento]\n`;
        return;
      }
      
      analysisText += `=== HOJA: ${sheet.name} ===\n`;
      
      // Limitar a las primeras 2000 filas
      const limitedData = sheet.data.slice(0, MAX_ROWS_PER_SHEET);
      
      limitedData.forEach((row, index) => {
        // Si ya tenemos demasiado texto, parar de procesar esta hoja
        if (analysisText.length > MAX_CHARS) return;
        
        if (index === 0) {
          // Headers - limitar a 10 columnas principales
          const limitedHeaders = row.slice(0, 10);
          analysisText += `COLUMNAS: ${limitedHeaders.join(' | ')}\n`;
          analysisText += '-'.repeat(50) + '\n';
        } else {
          // Data rows - limitar a 10 columnas y filtrar filas completamente vacías
          const limitedRow = row.slice(0, 10);
          const hasData = limitedRow.some(cell => cell && cell.toString().trim() !== '');
          
          if (hasData) {
            analysisText += `${limitedRow.join(' | ')}\n`;
          }
        }
      });
      
      // Mostrar cuántas filas se procesaron vs total
      const totalRows = sheet.data.length;
      const processedRows = Math.min(totalRows, MAX_ROWS_PER_SHEET);
      
      if (totalRows > MAX_ROWS_PER_SHEET) {
        analysisText += `\n[Procesadas ${processedRows} de ${totalRows} filas totales]\n`;
      }
      
      analysisText += '\n';
    });

    // Truncar si aún es muy largo
    if (analysisText.length > MAX_CHARS) {
      analysisText = analysisText.substring(0, MAX_CHARS) + '\n\n[DATOS TRUNCADOS PARA OPTIMIZACIÓN - PROCESADAS PRIMERAS 2000 FILAS]';
    }

    console.log(`Datos OP ZONES preparados: ${analysisText.length} caracteres`);
    return analysisText;
  }
}