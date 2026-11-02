export interface HealthProbe {
  check(): Promise<boolean>;
}
export const HEALTH_PROBE = Symbol("HealthProbe");
