import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildApp(config);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.host, port: config.port });
app.log.info(
  { turn: config.turnUrls.length > 0, stun: config.stunUrls.length > 0, web: Boolean(config.staticDir) },
  'CocoaAir is running',
);
