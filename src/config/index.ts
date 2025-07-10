import dotenv from 'dotenv';
dotenv.config();

export const PORT = Number(process.env.PORT) || 3002;
export const HOST = '0.0.0.0';
export const SESSION_FILE            = process.env.SESSION_FILE || 'session.json';
export const GRAFICAS_ENDPOINT_URL   = process.env.GRAFICAS_ENDPOINT_URL!;
export const CSV_URL                 = process.env.CSV_URL!;
