import { expect, it, vi } from 'vitest';
import { createTasksUseCases, parseTaskSearch, type TasksRepository } from './tasks';
import { ApiError } from '$lib/shared/errors';
it('propagates an expired session instead of presenting failed columns', async () => {
    const list = vi.fn<TasksRepository['list']>().mockRejectedValue(new ApiError('Expired', 401, 'UNAUTHORIZED'));
    const repository: TasksRepository = { list, get: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn(), move: vi.fn(), reassign: vi.fn(), remove: vi.fn() };
    await expect(createTasksUseCases(repository).loadBoard(parseTaskSearch(new URLSearchParams()).filters)).rejects.toMatchObject({ status: 401 });
});
it('loads each board status independently in board order, ignoring the legacy page', async () => {
    const filters = parseTaskSearch(new URLSearchParams('priority=high&page=3')).filters;
    const list = vi.fn<TasksRepository['list']>().mockResolvedValue({ items: [], total: 7, counts: {} });
    const repository: TasksRepository = { list, get: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn(), move: vi.fn(), reassign: vi.fn(), remove: vi.fn() };
    const board = await createTasksUseCases(repository).loadBoard(filters);
    expect(list.mock.calls.map(([query]) => [query.status, query.order, query.offset, query.limit])).toEqual([
        ['todo', 'board', 0, 50], ['in_progress', 'board', 0, 50], ['done', 'board', 0, 50], ['cancelled', 'board', 0, 50]
    ]);
    expect(board.todo.total).toBe(7);
});
it('preserves every task filter and server counts while translating pages', async () => {
    const params = new URLSearchParams('search=patient&status=todo&priority=high&roomId=R&patientId=P&picId=N&from=2026-11-01&to=2026-11-03&page=2');
    const { filters, page } = parseTaskSearch(params);
    const list = vi.fn<TasksRepository['list']>().mockResolvedValue({ items: [], total: 121, counts: { todo: 90 } });
    const repository: TasksRepository = { list, get: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn(), move: vi.fn(), reassign: vi.fn(), remove: vi.fn() };
    const result = await createTasksUseCases(repository).loadPage(filters, page);
    expect(list).toHaveBeenCalledWith({ ...Object.fromEntries(params.entries().filter(([key]) => key !== 'page')), limit: 50, offset: 100 });
    expect(result).toMatchObject({ page: 2, total: 121, counts: { todo: 90 } });
});
it.each([['-1', 0], ['bad', 0], ['99999', 2000]])('bounds the existing page input %s', (value, expected) => {
    expect(parseTaskSearch(new URLSearchParams({ page: value })).page).toBe(expected);
});
