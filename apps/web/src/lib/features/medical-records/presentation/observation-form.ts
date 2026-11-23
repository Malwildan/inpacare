import { fromDate, parseZonedDateTime, toCalendarDateTime } from '@internationalized/date';
import type { NewObservation } from '../domain/models';
import { formText } from '$lib/shared/presentation/form';

const facilityTimeZone = 'Asia/Jakarta';

export function observationLocalTime(value: Date): string {
    return toCalendarDateTime(fromDate(value, facilityTimeZone)).toString().slice(0, 16);
}

export function readObservationForm(form: FormData): NewObservation {
    const number = (name: string) => {
        const value = formText(form, name).trim();
        return value === '' ? undefined : Number(value);
    };
    return {
        symptoms: formText(form, 'symptoms'),
        nursingNote: formText(form, 'nursingNote') || undefined,
        observedAt: parseZonedDateTime(`${formText(form, 'observedAt')}[${facilityTimeZone}]`).toAbsoluteString(),
        temperature: number('temperature'),
        systolic: number('systolic'),
        diastolic: number('diastolic'),
        pulse: number('pulse'),
        respiratoryRate: number('respiratoryRate'),
        spo2: number('spo2'),
    };
}
