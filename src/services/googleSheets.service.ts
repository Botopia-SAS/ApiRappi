import { google, sheets_v4 } from 'googleapis';

export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets;
  // Configura el ID de la hoja y el rango donde está almacenada la URL
  private spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || 'TU_SPREADSHEET_ID';
  private range = 'Sheet1!A1'; // Por ejemplo, celda A1 contiene la csv_url

  constructor() {
    // Usando una API key para mayor simplicidad. Para flujos más complejos se recomienda OAuth2 o una cuenta de servicio.
    const apiKey = process.env.GOOGLE_API_KEY;
    this.sheets = google.sheets({ version: 'v4', auth: apiKey });
  }

  async getCSVUrl(): Promise<string> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.range,
    });
    const rows = res.data.values;
    if (rows && rows.length > 0 && rows[0].length > 0) {
      return rows[0][0] as string;
    } else {
      throw new Error('No se encontró la CSV URL en la hoja.');
    }
  }
}