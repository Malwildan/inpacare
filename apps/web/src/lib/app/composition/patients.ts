import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpPatients } from '$lib/features/patients/infrastructure/http-patients';
export function createPatients(fetcher: typeof fetch, options?: HttpOptions) { return createHttpPatients(createHttpClient(fetcher, options)); }
