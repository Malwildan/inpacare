import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpAuth } from '$lib/features/auth/infrastructure/http-auth';
export function createAuth(fetcher: typeof fetch, options?: HttpOptions) { return createHttpAuth(createHttpClient(fetcher, options)); }
