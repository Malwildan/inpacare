import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ApiError, loadApi } from '$lib/api';

type MedicalRecord = {
  id: string;
  patientId: string;
  patientName: string;
  medicalRecordNo: string;
  doctorId: string;
  doctorName: string;
  recordDate: string;
  complaint: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  observations: {
    id: string;
    nurseId: string;
    nurseName: string;
    symptoms: string;
    nursingNote: string;
    observedAt: string;
    temperature: number | null;
    bloodPressure: string | null;
    pulse: number | null;
    respiratoryRate: number | null;
    spo2: number | null;
  }[];
};

export const load: PageServerLoad = async ({ fetch, parent, params }) => {
  const { user, reference } = await parent();
  try {
    const record = await loadApi<MedicalRecord>(fetch, `/medical-records/${params.id}`);
    return { user, reference, record };
  } catch (failure) {
    if (isHttpError(failure) || isRedirect(failure)) throw failure;
    if (failure instanceof ApiError) {
      if (failure.status === 401) redirect(303, '/login');
      error(failure.status, failure.message);
    }
    error(503, 'Layanan InpaCare belum tersedia. Silakan coba kembali.');
  }
};
