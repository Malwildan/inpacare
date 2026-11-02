export const iso = (date: Date) => date.toISOString().slice(0, 10);
export function todayJakarta(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: string) => parts.find(part => part.type === type)!.value;
    return value('year') + '-' + value('month') + '-' + value('day');
}
export function calendarWeek(value: string | null, now = new Date()) {
    const current = new Date(todayJakarta(now) + 'T00:00:00Z');
    current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
    const from = value ?? iso(current);
    const start = new Date(from + 'T00:00:00Z');
    if (!Number.isFinite(start.getTime()) || iso(start) !== from)
        throw new Error('Tanggal kalender tidak valid.');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from, to: iso(end) };
}
