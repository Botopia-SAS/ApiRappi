import { Router, Request, Response } from 'express';
import { WhatsappService } from '../services/whatsapp.service';

export const whatsappRouter = (whService: WhatsappService): Router => {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // 1) Endpoint que devuelve el string del QR
  router.get('/qr', async (_, res) => {
    console.log('HTTP GET /api/qr');
    try {
      const qr = await whService.generateQr();
      console.log('– Enviando QR al cliente');
      res.json({ qr });
    } catch (err: any) {
      console.error('⚠️ Error al generar QR:', err);
      res.status(500).json({ error: 'Error al generar QR', details: err.message });
    }
  });

  // 2) Página con botón para generar y mostrar el QR
  router.get('/qr-page', (_req, res) => {
    res.send(`
      <!DOCTYPE html><html><body>
        <button id="gen">Generar QR</button>
        <button id="clear" style="margin-left:10px;">Borrar sesión</button>
        <p id="status"></p>
        <div id="out"></div>
        <script>
          const status = document.getElementById('status');
          const out = document.getElementById('out');

          document.getElementById('clear').onclick = async () => {
            status.textContent = 'Borrando sesión…';
            const r = await fetch('/api/logout', { method: 'POST' });
            status.textContent = r.ok ? 'Sesión eliminada' : 'Error al borrar';
            out.innerHTML = '';
          };

          document.getElementById('gen').onclick = async () => {
            status.textContent = 'Generando QR…';
            try {
              const r = await fetch('/api/qr');
              const data = await r.json();
              if (!r.ok) throw new Error(data.details||data.error);
              status.textContent = 'QR generado';
              out.innerHTML = 
                '<img src="https://api.qrserver.com/v1/create-qr-code/?data='+
                encodeURIComponent(data.qr)+'&size=200x200">';
            } catch (err) {
              status.textContent = 'ERROR: ' + err.message;
              console.error(err);
            }
          };
        </script>
      </body></html>
    `);
  });

  // GET /api/groups
  router.get('/groups', async (_, res) => {
    try {
      const groups = await whService.listGroupChats();
      res.json(groups);
    } catch {
      res.status(500).json({ error: 'No se pudo listar grupos' });
    }
  });

  // GET /api/groups/:id/messages?limit=10
  router.get('/groups/:id/messages', async (req, res) => {
    try {
      const groupId = `${req.params.id}@g.us`;
      const limit = Number(req.query.limit) || 50;
      const messages = await whService.getGroupMessages(groupId, limit);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: 'No se pudo obtener mensajes' });
    }
  });

  router.post('/logout', async (_, res) => {
    try {
      await whService.logout();
      res.json({ status: 'logged out' });
    } catch {
      res.status(500).json({ error: 'No se pudo cerrar sesión' });
    }
  });

  return router;
};
