import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, loadApi } from '$lib/api';

type RecordRow = {
  id: string;
  patientId: string;
  patientName: string;
  medicalRecordNo: string;
  doctorId: string;
  doctorName: string;
  recordDate: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  observationCount: number;
  version: number;
  createdAt: string;
};

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
  const layout = await parent();
  const search = url.searchParams.get('search')?.trim() ?? '';
  const query = new URLSearchParams({ limit: '100' });
  if (search) query.set('search', search);
  try {
    const { items, total } = await loadApi<{ items: RecordRow[]; total: number }>(
      fetch,
      `/medical-records?${query}`
    );
    return {
      records: items,
      total,
      initialSearch: search,
      reference: layout.reference,
      user: layout.user
    };
  } catch (failure) {
    if (isHttpError(failure) || isRedirect(failure)) throw failure;
    if (failure instanceof ApiError) {
      if (failure.status === 401) redirect(303, '/login');
      error(failure.status, failure.message);
    }
    error(503, 'Layanan InpaCare belum tersedia. Silakan coba kembali.');
  }
};
