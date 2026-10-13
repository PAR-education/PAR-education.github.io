export function tuitionInstallments(base, discount, count, firstDueDate) {
  if (
    !Number.isFinite(base) ||
    base < 0 ||
    base > 1000000 ||
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > 100 ||
    ![1, 2, 10].includes(count)
  )
    throw new Error("Provjerite osnovicu, popust i model plaćanja.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate))
    throw new Error("Unesite datum dospijeća.");
  const date = new Date(`${firstDueDate}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== firstDueDate
  )
    throw new Error("Datum dospijeća nije ispravan.");
  const totalCents = Math.round(base * (1 - discount / 100) * 100);
  const regularCents = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => {
    const next = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i, 1, 12),
    );
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return {
      amount:
        (i === count - 1
          ? totalCents - regularCents * (count - 1)
          : regularCents) / 100,
      dueDate: next.toISOString().slice(0, 10),
    };
  });
}
