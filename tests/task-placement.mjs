/**
 * @template {{status: string, startsOn: string, endsOn: string}} T
 * @param {T[]} placements
 * @param {Date} starts
 * @param {Date} ends
 * @returns {T}
 */
export function taskPlacement(placements, starts, ends) {
    const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
    const from = calendar.format(starts), to = calendar.format(ends);
    const placement = placements.find(item => item.status === 'active' && item.startsOn <= from && item.endsOn >= to);
    if (!placement) throw new Error(`No active synthetic placement covers ${from} through ${to}.`);
    return placement;
}
