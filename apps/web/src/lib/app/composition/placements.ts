import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpPlacements } from '$lib/features/placements/infrastructure/http-placements';
import { createPlacementsUseCases } from '$lib/features/placements';
export function createPlacements(fetcher: typeof fetch, options?: HttpOptions) { return createPlacementsUseCases(createHttpPlacements(createHttpClient(fetcher, options))); }
