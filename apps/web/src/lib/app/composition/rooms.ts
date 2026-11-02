import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpRooms } from '$lib/features/rooms/infrastructure/http-rooms';
export function createRooms(fetcher: typeof fetch, options?: HttpOptions) { return createHttpRooms(createHttpClient(fetcher, options)); }
