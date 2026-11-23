import { DomainError } from "../shared/domain-error";
export function validatePlacementSpan(start: string, end: string) {
  const valid = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return (
      d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() + 1 === +m[2] &&
      d.getUTCDate() === +m[3]
    );
  };
  const a = Date.parse(`${start}T00:00:00Z`),
    b = Date.parse(`${end}T00:00:00Z`);
  if (!valid(start) || !valid(end))
    throw DomainError.validation(
      "Tanggal masuk atau tanggal selesai tidak valid. Pilih tanggal pada kalender.",
    );
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a)
    throw DomainError.validation(
      "Tanggal selesai sebelum tanggal masuk. Pilih tanggal selesai yang sama dengan atau setelah tanggal masuk.",
    );
  const days = (b - a) / 86400000;
  if (days > 365)
    throw DomainError.validation("Rentang penempatan melebihi 365 hari. Pilih tanggal selesai yang lebih dekat.");
  return days;
}
export function placementIncludesTask(
  startsOn: string,
  endsOn: string,
  startsAt: Date,
  endsAt: Date,
) {
  const jakartaDate = (v: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(v);
  return jakartaDate(startsAt) >= startsOn && jakartaDate(endsAt) <= endsOn;
}
