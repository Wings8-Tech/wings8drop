export { Room } from './room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/server' || url.pathname.startsWith('/server/')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
      const roomName = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

      const requested = url.searchParams.get('peer') || '';
      const cookie = request.headers.get('cookie') || '';
      const match = cookie.match(/(?:^|;\s*)peerid=([^;]+)/);
      const valid = (value) => /^[A-Za-z0-9-]{8,64}$/.test(value);
      let peerId = valid(requested) ? requested : match ? decodeURIComponent(match[1]) : '';
      const setCookie = !match;
      if (!peerId) peerId = crypto.randomUUID();

      const id = env.ROOMS.idFromName(roomName);
      const stub = env.ROOMS.get(id);
      const headers = new Headers(request.headers);
      headers.set('x-wings8-peer', peerId);
      const forwarded = new Request(request, { headers });

      const response = await stub.fetch(forwarded);
      if (setCookie && response.status === 101) {
        const headers = new Headers(response.headers);
        headers.append('Set-Cookie', `peerid=${encodeURIComponent(peerId)}; Path=/; SameSite=Lax; Secure; Max-Age=31536000`);
        return new Response(null, { status: 101, headers, webSocket: response.webSocket });
      }
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};