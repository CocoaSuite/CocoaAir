import { buildApp } from './app';
import { loadConfig } from './config';

export interface Embedded {
  port: number;
  close: () => Promise<void>;
}

/**
 * Runs the web app and signalling server inside the desktop app, so a PC can host CocoaAir for
 * itself and for phones on the same network with nothing else to install.
 * Tries the preferred port first, so a phone's bookmark keeps working, then any free port.
 */
export async function startEmbedded(opts: { port: number; staticDir: string }): Promise<Embedded> {
  const config = loadConfig({ ...process.env, STATIC_DIR: opts.staticDir, HOST: '0.0.0.0', SINGLE_NETWORK: '1' });
  for (const port of [opts.port, 0]) {
    const { app } = await buildApp(config, { logger: false });
    try {
      await app.listen({ host: config.host, port });
      const addr = app.server.address();
      return { port: typeof addr === 'object' && addr ? addr.port : port, close: () => app.close() };
    } catch (err) {
      await app.close().catch(() => undefined);
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 0) throw err;
    }
  }
  throw new Error('No free port');
}
