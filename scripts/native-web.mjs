import { createServer } from 'node:http';

// Each listener has a fixed external protocol; client headers cannot change it.
delete process.env.ORIGIN;
delete process.env.PORT_HEADER;
process.env.HOST_HEADER = 'host';
process.env.PROTOCOL_HEADER = 'x-inpacare-protocol';
const { handler } = await import('../apps/web/build/handler.js');

const listeners = [{ port: Number(process.env.PORT ?? 8088), host: process.env.HOST ?? '0.0.0.0', protocol: 'http' }];
if (process.env.HTTPS_PROXY_PORT) {
  // Only the local HTTPS tunnel connects here; the LAN listener remains plain HTTP.
  listeners.push({ port: Number(process.env.HTTPS_PROXY_PORT), host: '127.0.0.1', protocol: 'https' });
}
const servers = listeners.map(({ port, host, protocol }) => {
  const server = createServer((request, response) => {
    request.headers['x-inpacare-protocol'] = protocol;
    handler(request, response);
  });
  server.listen(port, host);
  return server;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    let pending = servers.length;
    for (const server of servers) server.close(() => { if (--pending === 0) process.exit(0); });
  });
}
