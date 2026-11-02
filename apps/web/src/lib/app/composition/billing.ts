import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpBilling } from '$lib/features/billing/infrastructure/http-billing';
import { createBillingUseCases } from '$lib/features/billing';
export function createBilling(fetcher: typeof fetch, options?: HttpOptions) { return createBillingUseCases(createHttpBilling(createHttpClient(fetcher, options))); }
