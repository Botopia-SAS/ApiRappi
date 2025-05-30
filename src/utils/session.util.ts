import { SESSION_FILE } from '../config';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

/** Borra la carpeta de sesión */
export async function removeSessionDir(clientId: string) {
  const dir = path.resolve(__dirname, '../../.wwebjs_auth', `session-${clientId}`);
  await fsPromises.rm(dir, { recursive: true, force: true });
}

/** Retorna una promesa que se resuelve tras ms milisegundos */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function loadSession(): any | null {
  if (fs.existsSync(SESSION_FILE)) {
    const data = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return null;
}

export function saveSession(session: any) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
}
