import type { components } from '$lib/generated/api';
export type User = components['schemas']['User'];
export type Patient = components['schemas']['Patient'];
export type Staff = components['schemas']['Staff'];
export type Room = components['schemas']['Room'];
export type Placement = components['schemas']['Placement'];
export type Reference = components['schemas']['Reference'];
export interface List<T> { items: T[]; total: number }
