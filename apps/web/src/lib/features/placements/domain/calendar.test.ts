import { expect, it } from 'vitest';
import { calendarWeek, todayJakarta } from './calendar';
it('uses facility dates and inclusive seven-day ranges across month boundaries', () => {
    expect(todayJakarta(new Date('2026-11-01T18:00:00Z'))).toBe('2026-11-02');
    expect(calendarWeek(null, new Date('2026-11-01T18:00:00Z'))).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(calendarWeek('2026-10-29')).toEqual({ from: '2026-10-29', to: '2026-11-04' });
});
it.each(['bad', '2026-02-30'])('rejects invalid calendar input %s', value => expect(() => calendarWeek(value)).toThrow('Tanggal kalender tidak valid.'));
