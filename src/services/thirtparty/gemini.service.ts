import { GoogleGenAI } from '@google/genai';

export interface GeminiOptions {
  temperature?: number;
}

export class GeminiService {
  private ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!
  });
  private model = 'gemini-2.0-flash'; // o la versión que tengas disponible

  /** Genera texto con Gemini */
  async generate(prompt: string, options?: GeminiOptions): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt
    });
    return response.text?.trim() ?? '';
  }
}