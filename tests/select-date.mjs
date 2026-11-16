/** Selects a date through the calendar and, when provided, its local time. */
export async function selectDate(trigger, value) {
	const page = trigger.page();
	const [date, time] = value.split('T');
	await trigger.click();
	const calendar = page.locator('[data-calendar-root]');
	await calendar.waitFor({ state: 'visible' });
	const yearSelect = calendar.locator('[data-calendar-year-select]');
	if (await yearSelect.count()) await yearSelect.selectOption(String(Number(date.slice(0, 4))));
	const monthSelect = calendar.locator('[data-calendar-month-select]');
	if (await monthSelect.count()) await monthSelect.selectOption(String(Number(date.slice(5, 7))));
	// The visible month may start at today or at the field's current value.
	for (let attempt = 0; attempt < 120; attempt++) {
		const day = calendar.locator(`[data-calendar-cell][data-value="${date}"]:not([data-outside-month]) [data-calendar-day]`);
		if (await day.count()) {
			await day.click();
			break;
		}
		const first = await calendar.locator('[data-calendar-cell]:not([data-outside-month])').first().getAttribute('data-value');
		await calendar.getByRole('button', { name: date < first ? 'Bulan sebelumnya' : 'Bulan berikutnya', exact: true }).click();
	}
	if (time) {
		const popover = page.locator('[data-slot="popover-content"]');
		await popover.getByLabel('Waktu', { exact: true }).fill(time);
		await popover.getByRole('button', { name: 'Selesai', exact: true }).click();
	}
	await calendar.waitFor({ state: 'hidden' });
}
