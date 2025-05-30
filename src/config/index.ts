import dotenv from 'dotenv';
dotenv.config();

export const PORT                    = process.env.PORT    || 3000;
export const SESSION_FILE            = process.env.SESSION_FILE || 'session.json';
export const GRAFICAS_ENDPOINT_URL   = process.env.GRAFICAS_ENDPOINT_URL!;
export const CSV_URL                 = process.env.CSV_URL!;
