export async function goto(url) { window.lastNavigation = url; window.dispatchEvent(new CustomEvent('fixture-navigation', { detail: url })); }
export async function invalidateAll() {}
