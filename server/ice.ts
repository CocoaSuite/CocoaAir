import { createHmac } from 'node:crypto';
import type { RTCIceServerLike } from '../shared/protocol';
import type { Config } from './config';

/**
 * ICE servers handed to each device.
 * STUN lets two devices on different networks find a direct path; TURN relays the data when no
 * direct path exists. With TURN_SECRET set, each device gets credentials that expire after a day
 * (the coturn "use-auth-secret" scheme), so the secret itself never leaves the server.
 */
export function iceServersFor(config: Config, peerId: string, now = Date.now()): RTCIceServerLike[] {
  const servers: RTCIceServerLike[] = [];
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls });
  if (config.turnUrls.length) {
    if (config.turnSecret) {
      const expires = Math.floor(now / 1000) + 24 * 3600;
      const username = `${expires}:${peerId}`;
      const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
      servers.push({ urls: config.turnUrls, username, credential });
    } else if (config.turnUsername && config.turnCredential) {
      servers.push({ urls: config.turnUrls, username: config.turnUsername, credential: config.turnCredential });
    }
  }
  return servers;
}
