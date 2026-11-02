export const hasCompleteBloodPressure = (
  systolic?: number,
  diastolic?: number,
) => (systolic === undefined) === (diastolic === undefined);
