import { createHttpClient, type HttpOptions } from '$lib/shared/http/client';
import { createHttpTasks } from '$lib/features/tasks/infrastructure/http-tasks';
import { createTasksUseCases } from '$lib/features/tasks';
export function createTasks(fetcher: typeof fetch, options?: HttpOptions) { return createTasksUseCases(createHttpTasks(createHttpClient(fetcher, options))); }
