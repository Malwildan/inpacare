/** Locate active toast feedback, including messages shown above an open dialog. */
export function toastMessage(page, message = '', type = 'error') {
    return page.locator(`[data-sonner-toast][data-type="${type}"]:not([data-removed="true"])`)
        .filter({ hasText: message }).first();
}
