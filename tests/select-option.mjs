/** Selects a shadcn Select option by canonical value, label, or visible index. */
export async function selectOption(trigger, choice) {
	const page = trigger.page();
	await trigger.click();
	const options = page.getByRole('option');
	let option;
	if (typeof choice === 'string') {
		option = page.locator(`[role="option"][data-value="${choice.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
	} else if ('label' in choice) {
		option = page.getByRole('option', { name: choice.label, exact: true });
	} else {
		option = options.nth(choice.index);
	}
	await option.click();
	await page.getByRole('listbox').waitFor({ state: 'hidden' });
}

/** Reads the currently available option labels and closes the Select. */
export async function optionLabels(trigger) {
	const page = trigger.page();
	await trigger.click();
	const options = page.getByRole('option');
	await options.first().waitFor({ state: 'visible' });
	const labels = await options.allTextContents();
	await page.keyboard.press('Escape');
	await page.getByRole('listbox').waitFor({ state: 'hidden' });
	return labels.map(label => label.trim());
}
