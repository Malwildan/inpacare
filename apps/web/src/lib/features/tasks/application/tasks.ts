import type { Task, TaskHistory, NewTask, UpdateTask, ReassignTask, DeleteTask } from '../domain/models';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
export type TaskFilters = Record<'search' | 'status' | 'priority' | 'roomId' | 'patientId' | 'picId' | 'from' | 'to', string>;
export type TaskPage = {
    items: Task[];
    total: number;
    counts: Record<string, number>;
};
export type TasksRepository = {
    list(query: TaskFilters & {
        limit: number;
        offset: number;
    }): Promise<TaskPage>;
    get(id: string): Promise<Task>;
    history(id: string): Promise<TaskHistory[]>;
    create(input: NewTask): Promise<Task>;
    update(id: string, input: UpdateTask): Promise<Task>;
    reassign(id: string, input: ReassignTask): Promise<Task>;
    remove(id: string, input: DeleteTask): Promise<unknown>;
};
export type TasksPageData = {
    tasks: Task[];
    total: number;
    counts: Record<string, number>;
    page: number;
    filters: TaskFilters;
    user: User;
    reference: Reference;
};
export function parseTaskSearch(params: URLSearchParams) {
    const filters: TaskFilters = { search: '', status: '', priority: '', roomId: '', patientId: '', picId: '', from: '', to: '' };
    for (const key of Object.keys(filters) as (keyof TaskFilters)[])
        filters[key] = params.get(key) ?? '';
    const page = Math.max(0, Math.min(2000, Number(params.get('page')) || 0));
    return { filters, page };
}
export function createTasksUseCases(repository: TasksRepository) {
    return {
        ...repository,
        async loadPage(filters: TaskFilters, page: number) {
            const result = await repository.list({ ...filters, limit: 50, offset: page * 50 });
            return { tasks: result.items, total: result.total, counts: result.counts, page, filters };
        }
    };
}
export type Tasks = ReturnType<typeof createTasksUseCases>;
