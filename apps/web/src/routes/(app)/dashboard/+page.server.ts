import type { PageServerLoad } from './$types';
import { loadApi } from '$lib/api';
import { redirect } from '@sveltejs/kit';

type Cycle = {
	id: string; patientId: string; patientName: string; medicalRecordNo: string;
	placementId: string | null; room: string | null; doctorId?: string; doctorName: string;
	nurseId?: string; nurseName: string; status: string; version: number;
	requests: { id: string; kind: string; requestedEnd: string | null; reason: string; requestedBy: string; status: string; note?: string }[];
};

export const load: PageServerLoad = async ({ fetch, parent }) => {
	const { user } = await parent();
	if (user.role === 'ADMISI') redirect(303, '/invoices');
	const [cycles, notifications] = await Promise.all([
		loadApi<{ items: Cycle[] }>(fetch, '/cycles'),
		loadApi<{ items: { id: string; cycleId: string | null; message: string; readAt: string | null; createdAt: string }[] }>(fetch, '/notifications')
	]);
	return { cycles: cycles.items, notifications: notifications.items, user };
};
