import { Client, Message } from 'whatsapp-web.js';

export const whatsappController = {
  async handleMessage(msg: Message, client: Client) {
    const text = msg.body.trim().toLowerCase();

    // Ejemplo: al escribir "info", responde con tu info específica
    if (text === 'info') {
      await client.sendMessage(
        msg.from,
        'Aquí tienes la información específica que pediste: ...'
      );
      return;
    }

    // Otras palabras clave
    if (text.startsWith('hola')) {
      await client.sendMessage(msg.from, '¡Hola! ¿En qué puedo ayudarte?');
      return;
    }

    // Mensaje por defecto
    await client.sendMessage(
      msg.from,
      'No entendí tu comando. Escribe *info* para recibir información.'
    );
  },

  async removeSessionDir() {
    // implement session directory removal logic here
  },

  async logout() {
    try {
      await this.removeSessionDir();
    } catch (e: any) {
      if (e.code !== 'EBUSY') throw e;
      console.warn('No se pudo borrar Cookies-journal, está en uso');
    }
  }
};
