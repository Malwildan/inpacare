import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpCareCycles } from '$lib/features/care-cycles/infrastructure/http-care-cycles';
export function createCareCycles(fetcher: typeof fetch, options?: HttpOptions) { return createHttpCareCycles(createHttpClient(fetcher, options)); }
