import { expect, it, vi } from 'vitest';
import { createMedicalUseCases, type MedicalRepository } from './medical-records';
import type { User } from '$lib/features/auth';
it('returns a discriminated admission projection containing no clinical text', async () => {
    const repository: MedicalRepository = { clinicalList: vi.fn(), admissionList: vi.fn(), clinicalDetail: vi.fn(), admissionDetail: vi.fn().mockResolvedValue({ id: 'M1', patientId: 'P1', doctorId: 'D1', recordDate: '2026-11-03', diagnosis: 'must not leak' }), create: vi.fn(), update: vi.fn(), archive: vi.fn(), observe: vi.fn(), correctObservation: vi.fn() };
    const user: User = { id: 'A1', username: 'admisi', name: 'Admisi', role: 'ADMISI', coordinator: false, csrfToken: 'synthetic' };
    const result = await createMedicalUseCases(repository).loadDetail('M1', user, { patients: [], rooms: [], staff: [], placements: [] });
    expect(result.admisiProjection).toBe(true);
    expect(result.record).toEqual({ id: 'M1', patientId: 'P1', doctorId: 'D1', recordDate: '2026-11-03', patientName: 'P1', medicalRecordNo: '—' });
    expect(repository.clinicalDetail).not.toHaveBeenCalled();
});
