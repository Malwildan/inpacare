import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpNotifications } from '$lib/features/notifications/infrastructure/http-notifications';
export function createNotifications(fetcher: typeof fetch, options?: HttpOptions) { return createHttpNotifications(createHttpClient(fetcher, options)); }
