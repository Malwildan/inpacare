export const cycleTransitionAllowed = (current: string, next: string) =>
  (current === "pending" && next === "assigned") ||
  (current === "assigned" && next === "in_care");
