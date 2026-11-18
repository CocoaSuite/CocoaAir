import { describe, expect, it } from 'vitest';
import { formatRoomCode, normalizeRoomCode, type ServerMessage } from '../../shared/protocol';
import { Hub } from '../../server/hub';
import { iceServersFor } from '../../server/ice';
import { loadConfig } from '../../server/config';
import { networkKey } from '../../server/network';

function setup(now = { t: 0 }) {
  const hub = new Hub({ roomTtlMs: 10 * 60_000, roomMaxPeers: 3, iceServersFor: () => [], now: () => now.t });
  const add = (net: string, name?: string) => {
    const inbox: ServerMessage[] = [];
    const id = hub.connect(net, (m) => inbox.push(m));
    hub.handle(id, { t: 'hello', name, device: { kind: 'desktop', os: 'Windows', browser: 'Edge' } });
    const last = <T extends ServerMessage['t']>(t: T) =>
      [...inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
    return { id, inbox, last };
  };
  return { hub, add, now };
}

describe('network grouping', () => {
  it('groups by public IPv4 and by IPv6 /64', () => {
    expect(networkKey('203.0.113.5')).toBe('v4:203.0.113.5');
    expect(networkKey('::ffff:203.0.113.5')).toBe('v4:203.0.113.5');
    expect(networkKey('2001:db8:1:2::abcd')).toBe(networkKey('2001:db8:1:2:ffff::1'));
    expect(networkKey('2001:db8:1:2::abcd')).not.toBe(networkKey('2001:db8:1:3::abcd'));
  });

  it('treats private and loopback addresses as one local network', () => {
    for (const ip of ['192.168.1.20', '10.0.0.4', '172.20.1.1', '127.0.0.1', '::1', 'fe80::1', 'fd00::5']) {
      expect(networkKey(ip)).toBe('lan');
    }
    expect(networkKey('172.32.0.1')).toBe('v4:172.32.0.1');
  });
});

describe('room codes', () => {
  it('normalises typed codes', () => {
    expect(normalizeRoomCode(' kq7-4xm ')).toBe('KQ74XM');
    expect(normalizeRoomCode('KQ7 4XM extra')).toBe('KQ74XM');
    expect(formatRoomCode('KQ74XM')).toBe('KQ7-4XM');
  });
});

describe('hub', () => {
  it('shows devices on the same network to each other only', () => {
    const { add } = setup();
    const a = add('v4:1.1.1.1', 'Desk');
    const b = add('v4:1.1.1.1', 'Phone');
    const c = add('v4:2.2.2.2', 'Elsewhere');
    expect(a.last('peers')?.nearby.map((p) => p.name)).toEqual(['Phone']);
    expect(b.last('peers')?.nearby.map((p) => p.name)).toEqual(['Desk']);
    expect(c.last('peers')?.nearby).toEqual([]);
    expect(a.last('welcome')?.name).toBe('Desk');
  });

  it('joins a room by code across networks and relays signals only to visible devices', () => {
    const { hub, add } = setup();
    const a = add('v4:1.1.1.1');
    const b = add('v4:2.2.2.2');
    const c = add('v4:3.3.3.3');
    hub.handle(a.id, { t: 'room-create' });
    const code = a.last('room')!.room!.code;
    expect(code).toHaveLength(6);
    hub.handle(b.id, { t: 'room-join', code: formatRoomCode(code).toLowerCase() });
    expect(b.last('room')?.room?.code).toBe(code);
    expect(a.last('peers')?.room.map((p) => p.id)).toEqual([b.id]);

    hub.handle(a.id, { t: 'signal', to: b.id, data: { sdp: 'x' } });
    expect(b.last('signal')).toEqual({ t: 'signal', from: a.id, data: { sdp: 'x' } });
    hub.handle(c.id, { t: 'signal', to: a.id, data: 'nope' });
    expect(a.last('signal')).toBeUndefined();
  });

  it('rejects wrong, expired and full rooms', () => {
    const { hub, add, now } = setup();
    const a = add('n1');
    hub.handle(a.id, { t: 'room-create' });
    const code = a.last('room')!.room!.code;
    const b = add('n2');
    hub.handle(b.id, { t: 'room-join', code: 'AAAAAA' });
    expect(b.last('room-error')?.reason).toBe('not-found');
    hub.handle(b.id, { t: 'room-join', code: 'AB' });
    expect(b.last('room-error')?.reason).toBe('invalid');

    now.t = 11 * 60_000;
    hub.handle(b.id, { t: 'room-join', code });
    expect(b.last('room-error')?.reason).toBe('expired');
    hub.sweep();
    expect(a.last('room')?.room).toBeNull();

    hub.handle(a.id, { t: 'room-create' });
    const code2 = a.last('room')!.room!.code;
    for (const n of ['n3', 'n4']) hub.handle(add(n).id, { t: 'room-join', code: code2 });
    const late = add('n5');
    hub.handle(late.id, { t: 'room-join', code: code2 });
    expect(late.last('room-error')?.reason).toBe('full');
  });

  it('limits join attempts', () => {
    const { hub, add } = setup();
    const b = add('n');
    for (let i = 0; i < 11; i++) hub.handle(b.id, { t: 'room-join', code: 'AAAAAA' });
    expect(b.last('room-error')?.reason).toBe('rate-limited');
  });

  it('hands the room to another member when the creator leaves, and updates lists on disconnect', () => {
    const { hub, add } = setup();
    const a = add('n1');
    const b = add('n2');
    hub.handle(a.id, { t: 'room-create' });
    hub.handle(b.id, { t: 'room-join', code: a.last('room')!.room!.code });
    hub.disconnect(a.id);
    expect(b.last('room')?.room?.owner).toBe(true);
    expect(b.last('peers')?.room).toEqual([]);
  });

  it('cleans names and device details', () => {
    const { add } = setup();
    const a = add('n', '  <b>Very\u0000 long name that keeps going on</b> ');
    expect(a.last('welcome')?.name).toBe('bVery long name that kee');
  });
});

describe('ICE servers', () => {
  it('mints short-lived TURN credentials from a shared secret', () => {
    const config = loadConfig({ TURN_URLS: 'turn:turn.example.com:3478', TURN_SECRET: 's3cret' });
    const servers = iceServersFor(config, 'peer1', 1_000_000);
    expect(servers[0]?.urls).toEqual(['stun:stun.l.google.com:19302']);
    expect(servers[1]?.username).toBe(`${1000 + 86400}:peer1`);
    expect(servers[1]?.credential).toMatch(/=$/);
  });
});
