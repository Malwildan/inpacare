import { isHttpError, redirect } from '@sveltejs/kit';
import { ApiError } from '$lib/shared/errors';
import { requireApiDocsSession } from './session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
    setHeaders({ 'cache-control': 'private, no-store' });
    try {
        await requireApiDocsSession(fetch);
    } catch (failure) {
        if ((failure instanceof ApiError && failure.status === 401) || (isHttpError(failure) && failure.status === 401)) redirect(303, '/login');
        throw failure;
    }
    return {};
};
