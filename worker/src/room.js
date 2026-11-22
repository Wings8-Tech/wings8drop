export class Room {
  constructor(state) {
    this.state = state;
    this.peers = new Map();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const url = new URL(request.url);
    const peerId = url.searchParams.get('peer') || crypto.randomUUID();
    const name = peerName(request.headers.get('user-agent') || '');

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const previous = this.peers.get(peerId);
    if (previous) {
      try {
        previous.close(1000, 'replaced');
      } catch {}
      this.peers.delete(peerId);
    }

    const peer = { id: peerId, name, socket: server };
    const others = [];
    for (const [id, other] of this.peers) {
      others.push({ id, name: other.name });
      send(other.socket, { type: 'peer-joined', peer: { id, name } });
    }
    this.peers.set(peerId, peer);

    send(server, { type: 'peers', peers: others });

    server.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') return;
      if (message.type === 'disconnect') {
        server.close(1000, 'disconnect');
        return;
      }
      if (message.to) {
        const recipient = this.peers.get(String(message.to));
        if (recipient) {
          const payload = { ...message, sender: peerId };
          delete payload.to;
          send(recipient.socket, payload);
        }
      }
    });

    const remove = () => {
      if (this.peers.get(peerId) !== peer) return;
      this.peers.delete(peerId);
      for (const other of this.peers.values()) {
        send(other.socket, { type: 'peer-left', peerId });
      }
    };
    server.addEventListener('close', remove);
    server.addEventListener('error', remove);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

function send(socket, message) {
  try {
    socket.send(JSON.stringify(message));
  } catch {}
}

function peerName(userAgent) {
  const browser =
    /Edg\//.test(userAgent) ? 'Edge' :
    /OPR\//.test(userAgent) ? 'Opera' :
    /Firefox\//.test(userAgent) ? 'Firefox' :
    /Chrome\//.test(userAgent) ? 'Chrome' :
    /Safari\//.test(userAgent) ? 'Safari' :
    'Browser';
  const os =
    /Windows/.test(userAgent) ? 'Windows' :
    /Android/.test(userAgent) ? 'Android' :
    /iPhone|iPad|iPod/.test(userAgent) ? 'iOS' :
    /Mac OS X/.test(userAgent) ? 'macOS' :
    /Linux/.test(userAgent) ? 'Linux' :
    'Unknown';
  const type = /Mobile|Android|iPhone/.test(userAgent) ? 'mobile' : 'desktop';
  return { browser, os, type, model: null };
}