import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { MAX_SIGNAL_BYTES, type ClientMessage, type ServerMessage } from '../shared/protocol';
import type { Config } from './config';
import { Hub } from './hub';
import { iceServersFor } from './ice';
import { networkKey } from './network';

const CLIENT_TYPES = new Set(['hello', 'room-create', 'room-join', 'room-leave', 'signal', 'ping']);

export async function buildApp(config: Config, opts: { logger?: boolean } = {}): Promise<{ app: FastifyInstance; hub: Hub }> {
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: config.trustProxy,
  });

  const hub = new Hub({
    roomTtlMs: config.roomTtlMinutes * 60_000,
    roomMaxPeers: config.roomMaxPeers,
    iceServersFor: (id) => iceServersFor(config, id),
  });
  const sweeper = setInterval(() => hub.sweep(), 15_000);
  sweeper.unref();

  const perIp = new Map<string, number>();

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });

  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_SIGNAL_BYTES } });

  app.get('/api/health', async () => ({ ok: true, devices: hub.size }));

  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const ip = req.ip;
    const count = (perIp.get(ip) ?? 0) + 1;
    if (count > config.maxConnectionsPerIp) {
      socket.close(1008, 'Too many connections');
      return;
    }
    perIp.set(ip, count);

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const id = hub.connect(networkKey(ip), send);

    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 30_000);
    socket.on('pong', () => {
      alive = true;
    });

    socket.on('message', (raw, isBinary) => {
      alive = true;
      if (isBinary) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || !CLIENT_TYPES.has((msg as { t?: string }).t ?? '')) return;
      hub.handle(id, msg);
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      hub.disconnect(id);
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left <= 0) perIp.delete(ip);
      else perIp.set(ip, left);
    });
  });

  if (config.staticDir && existsSync(join(config.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      setHeaders(res, path) {
        if (path.includes(`${join('assets', '')}`)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else res.header('Cache-Control', 'no-cache');
      },
    });
  } else {
    app.get('/', async () => ({ ok: true, note: 'Signalling server only: no web app folder found.' }));
  }

  app.addHook('onClose', async () => clearInterval(sweeper));

  return { app, hub };
}
