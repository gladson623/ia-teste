import http from 'node:http';
import { AgentController } from '../agent/controller.js';
import { AgentStore } from '../agent/store.js';

const json = (res: http.ServerResponse, code: number, data: unknown) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
};

export const createServer = (controller: AgentController, store: AgentStore) => {
  return http.createServer(async (req, res) => {
    if (!req.url) return json(res, 404, { error: 'not_found' });

    const readBody = async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      if (chunks.length === 0) return {};
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return {};
      }
    };

    if (req.method === 'GET' && req.url === '/state') return json(res, 200, store.getCurrentState());
    if (req.method === 'GET' && req.url === '/memory') return json(res, 200, store.memories);
    if (req.method === 'GET' && req.url === '/goals') return json(res, 200, store.goals);
    if (req.method === 'GET' && req.url === '/experiences') return json(res, 200, store.experiences);
    if (req.method === 'GET' && req.url === '/skills') return json(res, 200, store.skills);

    if (req.method === 'POST' && req.url === '/cycle') return json(res, 200, await controller.cycle());
    if (req.method === 'POST' && req.url === '/chat') {
      const body = await readBody();
      const message = String((body as { message?: string }).message ?? '');
      if (message.trim()) {
        store.remember(message, 2, ['chat']);
      }
      return json(res, 200, { accepted: true });
    }
    if (req.method === 'POST' && req.url === '/memory') {
      const body = await readBody() as { content?: string; importance?: number; tags?: string[] };
      return json(res, 201, store.remember(String(body.content ?? ''), Number(body.importance ?? 3), Array.isArray(body.tags) ? body.tags : []));
    }
    if (req.method === 'POST' && req.url === '/goals') {
      const body = await readBody() as { title?: string; priority?: number };
      return json(res, 201, store.createGoal(String(body.title ?? ''), Number(body.priority ?? 3)));
    }
    if (req.method === 'POST' && req.url === '/agent/start') {
      controller.start();
      return json(res, 200, { running: true });
    }
    if (req.method === 'POST' && req.url === '/agent/pause') {
      controller.pause();
      return json(res, 200, { running: false });
    }

    return json(res, 404, { error: 'not_found' });
  });
};
