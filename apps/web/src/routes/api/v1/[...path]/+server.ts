import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
const proxy: RequestHandler = async ({ request, url, params }) => {
 const headers = new Headers(request.headers);
 headers.delete('host'); headers.delete('connection'); headers.delete('content-length');
 headers.set('x-forwarded-host', url.host); headers.set('x-forwarded-proto', url.protocol.slice(0,-1));
 try {
  const upstream = await fetch(`${env.API_ORIGIN ?? 'http://127.0.0.1:8080'}/api/v1/${params.path}${url.search}`, {
   method: request.method, headers, body: ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(), redirect:'manual'
  });
  const output = new Headers(upstream.headers); output.delete('transfer-encoding'); output.delete('connection'); output.set('cache-control','no-store');
  return new Response(upstream.body, { status:upstream.status, headers:output });
 } catch { return Response.json({ error:{ code:'API_UNAVAILABLE', message:'Layanan belum tersedia. Silakan coba kembali.' } }, { status:503 }); }
};
export const GET=proxy; export const POST=proxy; export const PATCH=proxy; export const DELETE=proxy;
