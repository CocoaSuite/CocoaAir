import { resolve } from 'node:path';

export interface Config {
  host: string;
  port: number;
  staticDir: string | null;
  trustProxy: boolean;
  /** Minutes a fresh room code can be joined before it expires. */
  roomTtlMinutes: number;
  /** Most devices in one room. */
  roomMaxPeers: number;
  stunUrls: string[];
  turnUrls: string[];
  /** coturn "use-auth-secret": short-lived credentials are minted per device. */
  turnSecret: string | null;
  /** Fixed TURN credentials, used when no secret is set. */
  turnUsername: string | null;
  turnCredential: string | null;
  /** Most connections from one address. */
  maxConnectionsPerIp: number;
  /**
   * Treat every device as nearby. Used when the server runs on a PC in the home network
   * (the desktop app): anything that can reach it directly is on the same network.
   */
  singleNetwork: boolean;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const staticDir = env.STATIC_DIR === '' ? null : resolve(env.STATIC_DIR ?? 'dist');
  const stun = env.STUN_URLS === undefined ? ['stun:stun.l.google.com:19302'] : list(env.STUN_URLS);
  return {
    host: env.HOST ?? '0.0.0.0',
    port: int(env.PORT, 8080),
    staticDir,
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    roomTtlMinutes: int(env.ROOM_TTL_MINUTES, 10),
    roomMaxPeers: int(env.ROOM_MAX_PEERS, 8),
    stunUrls: stun,
    turnUrls: list(env.TURN_URLS),
    turnSecret: env.TURN_SECRET || null,
    turnUsername: env.TURN_USERNAME || null,
    turnCredential: env.TURN_CREDENTIAL || null,
    maxConnectionsPerIp: int(env.MAX_CONNECTIONS_PER_IP, 32),
    singleNetwork: env.SINGLE_NETWORK === '1' || env.SINGLE_NETWORK === 'true',
  };
}
