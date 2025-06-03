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
}