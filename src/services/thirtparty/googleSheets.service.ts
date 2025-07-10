import { google, sheets_v4 } from 'googleapis';

export class GoogleSheetsService {
  private static instance: GoogleSheetsService;
  private auth: any;
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  
  private constructor() {
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;
    const apiKey = process.env.GOOGLE_API_KEY;
    this.auth = apiKey;
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  public static getInstance(): GoogleSheetsService {
    if (!GoogleSheetsService.instance) {
      GoogleSheetsService.instance = new GoogleSheetsService();
    }
    return GoogleSheetsService.instance;
  }

  async getDataAsCSV(periodo: number = 4, includeOrdersY: boolean = true): Promise<string> {
    try {
      console.log(`📊 Obteniendo datos CSV - Período: ${periodo} semanas (acumulativo), ORDERS_Y: ${includeOrdersY}`);
      
      // Obtener datos de la hoja
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:ZZ', // Obtener todas las columnas disponibles
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No se encontraron datos en la hoja');
      }

      // Primera fila contiene los headers
      const headers = rows[0];
      const dataRows = rows.slice(1);

      // Construir mapeo de columnas acumulativo con columnas obligatorias
      const columnMapping = this.buildCumulativeColumnMapping(headers, periodo, includeOrdersY);
      
      console.log(`📋 Columnas seleccionadas:`, columnMapping);

      // Filtrar datos según las columnas seleccionadas
      const filteredHeaders = columnMapping.map(col => headers[col.index]);
      const filteredRows = dataRows.map(row => 
        columnMapping.map(col => row[col.index] || '')
      );

      // Convertir a CSV
      const csvContent = [
        filteredHeaders.join(','),
        ...filteredRows.map(row => row.join(','))
      ].join('\n');

      console.log(`✅ CSV generado con ${filteredRows.length} filas y ${filteredHeaders.length} columnas`);
      console.log(`📝 Headers: ${filteredHeaders.join(', ')}`);
      
      return csvContent;

    } catch (error) {
      console.error('❌ Error obteniendo datos como CSV:', error);
      throw error;
    }
  }

  private buildCumulativeColumnMapping(headers: string[], periodo: number, includeOrdersY: boolean): Array<{name: string, index: number}> {
    const columnMapping: Array<{name: string, index: number}> = [];
    const usedIndices = new Set<number>(); // ✅ Prevenir duplicados

    // ✅ COLUMNAS OBLIGATORIAS SEGÚN EL ERROR DEL MICROSERVICIO:
    // A: COUNTRY (índice 0)
    // B: SQUAD (índice 1) 
    // C: ORDER_HOUR (índice 2)
    
    const requiredColumns = [
      { name: 'COUNTRY', expectedIndex: 0 },
      { name: 'SQUAD', expectedIndex: 1 },
      { name: 'ORDER_HOUR', expectedIndex: 2 }
    ];

    // Agregar columnas obligatorias primero
    requiredColumns.forEach(({ name, expectedIndex }) => {
      if (headers[expectedIndex] && headers[expectedIndex].toUpperCase().includes(name)) {
        columnMapping.push({ name: headers[expectedIndex], index: expectedIndex });
        usedIndices.add(expectedIndex); // ✅ Marcar como usado
        console.log(`✅ Columna obligatoria encontrada: ${headers[expectedIndex]} en índice ${expectedIndex}`);
      } else {
        // Buscar la columna por nombre si no está en el índice esperado
        const foundIndex = headers.findIndex(h => h.toUpperCase().includes(name));
        if (foundIndex !== -1) {
          columnMapping.push({ name: headers[foundIndex], index: foundIndex });
          usedIndices.add(foundIndex); // ✅ Marcar como usado
          console.log(`✅ Columna obligatoria encontrada: ${headers[foundIndex]} en índice ${foundIndex} (diferente al esperado ${expectedIndex})`);
        } else {
          console.error(`❌ Columna obligatoria ${name} no encontrada`);
          throw new Error(`Columna obligatoria ${name} no encontrada en la hoja de Google Sheets`);
        }
      }
    });

    // ✅ SIEMPRE INCLUIR ORDERS_Y (órdenes de ayer) si se solicita
    if (includeOrdersY) {
      const ordersYIndex = headers.findIndex(h => h.toUpperCase().includes('ORDERS_Y'));
      if (ordersYIndex !== -1 && !usedIndices.has(ordersYIndex)) {
        columnMapping.push({ name: headers[ordersYIndex], index: ordersYIndex });
        usedIndices.add(ordersYIndex); // ✅ Marcar como usado
        console.log(`📈 ORDERS_Y incluido: ${headers[ordersYIndex]} en índice ${ordersYIndex}`);
      } else if (ordersYIndex === -1) {
        console.warn('⚠️ ORDERS_Y no encontrado en headers');
      }
    }

    // ✅ INCLUIR COLUMNAS DE PERÍODO ACUMULATIVO (sin duplicados)
    const periodPatterns = [
      'TODAY', 'HOY', 'ORDERS_TODAY', 'GASTOS_TODAY',
      'YESTERDAY', 'AYER', 'ORDERS_YESTERDAY', 'GASTOS_YESTERDAY'
    ];

    // Agregar patrones para semanas (W1, W2, W3, W4, etc.)
    for (let week = 1; week <= periodo; week++) {
      periodPatterns.push(
        `WEEK_${week}`, `W_${week}`, `W${week}`,
        `SEMANA_${week}`, `S_${week}`, `S${week}`,
        `ORDERS_W${week}`, `GASTOS_W${week}`,
        `ORDERS_WEEK_${week}`, `GASTOS_WEEK_${week}`,
        `ORDERS_LW${week}`, `GASTOS_LW${week}` // ✅ Agregar patrón LW (Last Week)
      );
    }

    // Buscar y agregar columnas de período (sin duplicados)
    periodPatterns.forEach(pattern => {
      const columnIndex = headers.findIndex(h => h.toUpperCase().includes(pattern.toUpperCase()));
      if (columnIndex !== -1 && !usedIndices.has(columnIndex)) {
        columnMapping.push({ name: headers[columnIndex], index: columnIndex });
        usedIndices.add(columnIndex); // ✅ Marcar como usado
        console.log(`📅 Columna de período incluida: ${headers[columnIndex]} en índice ${columnIndex}`);
      }
    });

    console.log(`🎯 Lógica acumulativa: ${requiredColumns.length} columnas obligatorias + ${columnMapping.length - requiredColumns.length - (includeOrdersY ? 1 : 0)} columnas de período + ${includeOrdersY ? 1 : 0} ORDERS_Y = ${columnMapping.length} columnas totales`);
    
    // Validar que tenemos las columnas mínimas requeridas
    if (columnMapping.length < 4) {
      throw new Error('No se encontraron suficientes columnas de datos para generar las gráficas');
    }
    
    return columnMapping;
  }

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

      // Obtener datos de cada hoja OP ZONES (LIMITADO A 16000 FILAS)
      const results = [];
      for (const sheet of opZonesSheets) {
        const sheetName = sheet.properties?.title;
        if (!sheetName) continue;

        try {
          // Limitar el rango a las primeras 16000 filas (A1:Z16000)
          const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
            range: `'${sheetName}'!A1:Z16000`,
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
   * Convierte los datos de múltiples hojas OP ZONES a formato de texto para análisis (OPTIMIZADO - 16000 filas)
   */
  async getOpZonesDataForAnalysis(): Promise<string> {
    const opZonesSheets = await this.getOpZonesSheets();
    if (opZonesSheets.length === 0) {
      throw new Error('No OP ZONES sheets found');
    }

    // Calcular la última semana cerrada (lunes a domingo)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
    // Si es lunes, retrocede 7 días; si no, retrocede hasta el lunes anterior
    const lastWeekEnd = new Date(today);
    lastWeekEnd.setDate(today.getDate() - dayOfWeek); // último domingo
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6); // lunes anterior

    const prevWeekEnd = new Date(lastWeekStart);
    prevWeekEnd.setDate(lastWeekStart.getDate() - 1); // domingo anterior
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekEnd.getDate() - 6); // lunes anterior

    const format = (d: Date) => d.toISOString().slice(0, 10);

    let analysisText = `DATOS DE OP ZONES PARA ANÁLISIS:\n\nComparar:\n- Última semana cerrada: ${format(lastWeekStart)} a ${format(lastWeekEnd)}\n- Semana anterior: ${format(prevWeekStart)} a ${format(prevWeekEnd)}\n\n`;

    // Aumentar el límite de filas por hoja (por ejemplo, 16000)
    const MAX_ROWS_PER_SHEET = 16000;
    const MAX_CHARS = 160000;

    opZonesSheets.forEach(sheet => {
      if (analysisText.length > MAX_CHARS) return;
      analysisText += `=== HOJA: ${sheet.name} ===\n`;
      const limitedData = sheet.data.slice(0, MAX_ROWS_PER_SHEET);
      limitedData.forEach((row, idx) => {
        if (analysisText.length > MAX_CHARS) return;
        if (idx === 0) {
          analysisText += `COLUMNAS: ${row.slice(0, 12).join(' | ')}\n${'-'.repeat(50)}\n`;
        } else {
          analysisText += `${row.slice(0, 12).join(' | ')}\n`;
        }
      });
      analysisText += '\n';
    });

    if (analysisText.length > MAX_CHARS) {
      analysisText = analysisText.substring(0, MAX_CHARS) + '\n\n[DATOS TRUNCADOS]';
    }

    return analysisText; // <-- Asegura el return aquí
  }

  /**
   * Procesa los datos de OP ZONES para calcular las variaciones semanales.
   * Devuelve un objeto estructurado con los resultados.
   */
  async getOpZonesAnalysis() {
    const [ordersSheet, basesSheet] = await Promise.all([
      this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: "'OP ZONES ORDERS'!A1:Z16000",
      }),
      this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: "'OP ZONES BASES'!A1:Z16000",
      }),
    ]);

    const ordersData = ordersSheet.data.values || [];
    const basesData = basesSheet.data.values || [];

    // --- Lógica de cálculo ---
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastWeekEnd = new Date(today);
    lastWeekEnd.setDate(today.getDate() - dayOfWeek);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6);

    const prevWeekStart = new Date(lastWeekStart);
    prevWeekStart.setDate(lastWeekStart.getDate() - 7);

    const analysis: { [key: string]: any } = {}; // { AR: { zone0: { orders: { current: 0, prev: 0 }, bases: ... } } }

    const processRow = (row: any[], dataType: 'orders' | 'bases') => {
      const [weekStr, _type, country, city, _zoneName, zoneClass, ...rest] = row;
      const week = new Date(weekStr);
      const value = dataType === 'orders' ? parseInt(rest[2]) || 0 : parseInt(rest[1]) || 0; // TOTAL_ORDERS o ACTIVE_USERS

      if (!country || !zoneClass || isNaN(value)) return;

      const key = `zone${zoneClass}`;
      if (!analysis[country]) analysis[country] = {};
      if (!analysis[country][key]) {
        analysis[country][key] = {
          orders: { current: 0, prev: 0 },
          bases: { current: 0, prev: 0 },
          topCities: {},
        };
      }

      const weekType = week >= lastWeekStart ? 'current' : 'prev';
      analysis[country][key][dataType][weekType] += value;
      
      if (dataType === 'orders' && weekType === 'current') {
        analysis[country][key].topCities[city] = (analysis[country][key].topCities[city] || 0) + value;
      }
    };

    ordersData.slice(1).forEach(row => processRow(row, 'orders'));
    basesData.slice(1).forEach(row => processRow(row, 'bases'));

    // Calcular WoW y formatear
    for (const country in analysis) {
      for (const zone in analysis[country]) {
        const d = analysis[country][zone];
        d.orders.wow = d.orders.prev > 0 ? ((d.orders.current - d.orders.prev) / d.orders.prev) * 100 : 0;
        d.bases.wow = d.bases.prev > 0 ? ((d.bases.current - d.bases.prev) / d.bases.prev) * 100 : 0;
        
        d.topCities = Object.entries(d.topCities)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 3)
          .map(([city, volume]) => ({ city, volume: volume as number }));
      }
    }

    return analysis;
  }
}