import type { Task, TaskHistory, NewTask, UpdateTask, ReassignTask, DeleteTask, MoveTask } from '../domain/models';
import type { User } from '$lib/features/auth';
import type { Reference } from '$lib/features/reference-data';
import { ApiError } from '$lib/shared/errors';
export type TaskFilters = Record<'search' | 'status' | 'priority' | 'roomId' | 'patientId' | 'picId' | 'from' | 'to', string>;
export type TaskPage = {
    items: Task[];
    total: number;
    counts: Record<string, number>;
};
export const boardStatuses = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export type BoardStatus = typeof boardStatuses[number];
export type BoardColumn = { items: Task[]; total: number; error: boolean; filtered: boolean };
export type TaskBoard = Record<BoardStatus, BoardColumn>;
export type TasksRepository = {
    list(query: TaskFilters & {
        limit: number;
        offset: number;
        order?: 'board';
    }): Promise<TaskPage>;
    get(id: string): Promise<Task>;
    history(id: string): Promise<TaskHistory[]>;
    create(input: NewTask): Promise<Task>;
    update(id: string, input: UpdateTask): Promise<Task>;
    move(id: string, input: MoveTask): Promise<Task>;
    reassign(id: string, input: ReassignTask): Promise<Task>;
    remove(id: string, input: DeleteTask): Promise<unknown>;
};
export type TasksPageData = {
    board: TaskBoard;
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
        async loadBoard(filters: TaskFilters): Promise<TaskBoard> {
            const columns = await Promise.all(boardStatuses.map(async status => {
                if (filters.status && filters.status !== status) return { items: [], total: 0, error: false, filtered: true };
                try {
                    const page = await repository.list({ ...filters, status, order: 'board', limit: 50, offset: 0 });
                    return { items: page.items, total: page.total, error: false, filtered: false };
                } catch (error) {
                    if (error instanceof ApiError && error.status === 401) throw error;
                    return { items: [], total: 0, error: true, filtered: false };
                }
            }));
            return Object.fromEntries(boardStatuses.map((status, index) => [status, columns[index]])) as TaskBoard;
        },
        async loadPage(filters: TaskFilters, page: number) {
            const result = await repository.list({ ...filters, limit: 50, offset: page * 50 });
            return { tasks: result.items, total: result.total, counts: result.counts, page, filters };
        }
    };
}
export type Tasks = ReturnType<typeof createTasksUseCases>;
