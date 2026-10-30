import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';

type Room = { id: string; name: string; roomClass: string; capacity: number; status: string; occupants: number };
type Patient = { id: string; name: string; medicalRecordNo: string };
type Placement = { id: string; patientId: string; patientName: string; medicalRecordNo: string; roomId: string; roomName: string; roomClass: string; startsOn: string; endsOn: string; status: string; version: number };
function monday(date: Date): Date {
	const day = date.getUTCDay();
	const result = new Date(date);
	result.setUTCDate(date.getUTCDate()-((day+6)%7));
	return result;
}
const iso = (date: Date) => date.toISOString().slice(0,10);
function todayJakarta() {
	const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
	const value = (type: string) => parts.find((part) => part.type===type)!.value;
	return value('year')+'-'+value('month')+'-'+value('day');
}

export const load: PageServerLoad = async ({ fetch, url }) => {
	const start = url.searchParams.get('from') ?? iso(monday(new Date(todayJakarta()+'T00:00:00Z')));
	const from = new Date(start + 'T00:00:00Z');
	if (!Number.isFinite(from.getTime()) || iso(from) !== start) throw new Error('Tanggal kalender tidak valid.');
	const to = new Date(from); to.setUTCDate(to.getUTCDate()+6);
	const [occupancy, rooms, patients] = await Promise.all([
		loadApi<{items: Placement[]; from: string; to: string}>(fetch, '/occupancy?from='+start+'&to='+iso(to)),
		loadApi<{items: Room[]}>(fetch, '/rooms'),
		loadApi<{items: Patient[]}>(fetch, '/patients')
	]);
	return {from:start,to:iso(to),placements:occupancy.items,rooms:rooms.items,patients:patients.items};
};
