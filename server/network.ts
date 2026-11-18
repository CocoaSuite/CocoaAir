import { isIPv4, isIPv6 } from 'node:net';

/**
 * Decides which devices count as "nearby": the ones that reach the server from the same network.
 *
 * - Behind one router, devices share a public IPv4 address, so that address is the key.
 * - With IPv6 each device has its own address, but they share the /64 prefix of the home network.
 * - When the server itself runs on the local network, devices arrive with private addresses
 *   (192.168.x.x, 10.x.x.x, fe80::…), and they all count as one network.
 */
export function networkKey(rawIp: string): string {
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:') && isIPv4(ip.slice(7))) ip = ip.slice(7);

  if (isIPv4(ip)) {
    return isPrivateV4(ip) ? 'lan' : `v4:${ip}`;
  }
  if (isIPv6(ip)) {
    const groups = expandV6(ip);
    if (isPrivateV6(groups)) return 'lan';
    return `v6:${groups.slice(0, 4).join(':')}`;
  }
  return `other:${ip}`;
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT is shared too widely to tell homes apart
  );
}

function isPrivateV6(groups: string[]): boolean {
  const first = Number.parseInt(groups[0] ?? '0', 16);
  const isLoopback = groups.slice(0, 7).every((g) => g === '0000') && groups[7] === '0001';
  return isLoopback || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

/** "2001:db8::1" → eight four-digit groups. */
export function expandV6(ip: string): string[] {
  const noZone = ip.split('%')[0] ?? ip;
  const [head = '', tail] = noZone.split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = tail === undefined ? [] : new Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((g) => g.padStart(4, '0').toLowerCase());
}
