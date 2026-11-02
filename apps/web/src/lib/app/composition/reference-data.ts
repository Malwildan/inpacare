import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpReference } from '$lib/features/reference-data/infrastructure/http-reference';
export function createReferenceData(fetcher: typeof fetch, options?: HttpOptions) { return createHttpReference(createHttpClient(fetcher, options)); }
