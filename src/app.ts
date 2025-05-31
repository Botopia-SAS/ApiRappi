import 'dotenv/config';
import express from 'express';
import { PORT } from './config';
import { WhatsappService } from './services/whatsapp.service';
import { GeminiService } from './services/gemini.service';
import { whatsappRouter } from './routes/whatsapp.route';

const app = express();
app.use(express.json());

const gemini = new GeminiService();
import { GoogleSheetsService } from './services/googleSheets.service';
const sheetsService = new GoogleSheetsService();
const whatsappService = new WhatsappService(gemini, sheetsService);

app.use('/api', whatsappRouter(whatsappService));

app.listen(PORT, () =>
  console.log(`🚀 Server corriendo en http://localhost:${PORT}`)
);
