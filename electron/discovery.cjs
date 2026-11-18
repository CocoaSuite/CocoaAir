// Finds another PC already hosting CocoaAir on this network, so every desktop app on the same
// Wi-Fi shares one signalling server and sees the same devices.
//
// A host answers UDP broadcasts on DISCOVERY_PORT. A starting app asks first; with no answer it
// becomes the host itself.
const dgram = require('dgram')
const os = require('os')

const DISCOVERY_PORT = 47801
const ASK = 'cocoaair-who-hosts'

/** IPv4 addresses phones can reach, real network adapters first. */
function lanAddresses() {
  const virtual = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Docker|Loopback|tailscale|ZeroTier|vboxnet|utun|bridge/i
  const out = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      const isPrivate = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)
      out.push({ address: a.address, netmask: a.netmask, score: (isPrivate ? 2 : 0) + (virtual.test(name) ? -3 : 1) })
    }
  }
  return out.sort((x, y) => y.score - x.score)
}

function broadcastAddresses() {
  const set = new Set(['255.255.255.255'])
  for (const { address, netmask } of lanAddresses()) {
    const a = address.split('.').map(Number)
    const m = netmask.split('.').map(Number)
    set.add(a.map((v, i) => (v & m[i]) | (~m[i] & 255)).join('.'))
  }
  return [...set]
}

/** Resolves with { address, port } of a host that answers within the wait, or null. */
function findHost(waitMs = 900) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    let done = false
    const finish = (v) => {
      if (done) return
      done = true
      try { sock.close() } catch {}
      resolve(v)
    }
    const own = new Set(lanAddresses().map((a) => a.address))
    sock.on('error', () => finish(null))
    sock.on('message', (buf, rinfo) => {
      try {
        const msg = JSON.parse(buf.toString())
        if (msg.t === 'cocoaair-host' && Number.isInteger(msg.port) && !own.has(rinfo.address)) {
          finish({ address: rinfo.address, port: msg.port })
        }
      } catch {}
    })
    sock.bind(0, () => {
      sock.setBroadcast(true)
      const ask = Buffer.from(JSON.stringify({ t: ASK }))
      const send = () => { for (const b of broadcastAddresses()) sock.send(ask, DISCOVERY_PORT, b, () => {}) }
      send()
      setTimeout(send, 300)
      setTimeout(() => finish(null), waitMs)
    })
  })
}

/** Answers other apps' questions while this PC hosts. Returns a stop function. */
function announce(port) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  sock.on('error', () => {})
  sock.on('message', (buf, rinfo) => {
    if (buf.toString().includes(ASK)) {
      sock.send(Buffer.from(JSON.stringify({ t: 'cocoaair-host', port })), rinfo.port, rinfo.address, () => {})
    }
  })
  sock.bind(DISCOVERY_PORT, () => { try { sock.setBroadcast(true) } catch {} })
  return () => { try { sock.close() } catch {} }
}

module.exports = { findHost, announce, lanAddresses }
