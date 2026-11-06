import { json } from '@sveltejs/kit';
import { apiDocsSpec } from '../spec';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
    return json(await apiDocsSpec(fetch), { headers: { 'cache-control': 'private, no-store' } });
};
