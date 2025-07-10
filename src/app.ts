import 'dotenv/config';
import express from 'express';
import { PORT } from './config';
import { WhatsappService } from './services/whatsapp.service';
import { GeminiService } from './services/thirtparty/gemini.service';
import { GoogleSheetsService } from './services/thirtparty/googleSheets.service';
import { whatsappRouter } from './routes/whatsapp.route';

const app = express();
app.use(express.json());

const gemini = new GeminiService();
const sheetsService = GoogleSheetsService.getInstance();
const whatsappService = new WhatsappService(gemini, sheetsService);

app.use('/api', whatsappRouter(whatsappService));

app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server corriendo en http://localhost:${PORT}`)
);
