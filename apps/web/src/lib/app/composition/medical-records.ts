import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpMedicalRecords } from '$lib/features/medical-records/infrastructure/http-medical-records';
import { createMedicalUseCases } from '$lib/features/medical-records';
export function createMedicalRecords(fetcher: typeof fetch, options?: HttpOptions) { return createMedicalUseCases(createHttpMedicalRecords(createHttpClient(fetcher, options))); }
