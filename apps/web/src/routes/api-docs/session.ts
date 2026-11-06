import { error } from '@sveltejs/kit';
import { createAuth } from '$lib/app/composition/auth';
import { ApiError } from '$lib/shared/errors';

export async function requireApiDocsSession(fetcher: typeof fetch) {
    try {
        await createAuth(fetcher).current();
    } catch (failure) {
        if (failure instanceof ApiError && failure.status === 401) error(401, 'Login required.');
        error(503, 'Layanan InpaCare belum tersedia. Silakan coba kembali.');
    }
}
