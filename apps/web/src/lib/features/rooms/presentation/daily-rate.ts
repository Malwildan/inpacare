export function parseDailyRate(input: string): string | null {
    const value = input.trim().replace(/^Rp\s*/i, '');
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?$/.test(value)) return null;
    return value.replace(/\./g, '').replace(/,(?=\d)/, '.').replace(/,$/, '').replace(/^0+(?=\d)/, '');
}

export function formatDailyRateInput(input: string): string {
    const value = input.trim().replace(/^Rp\s*/i, '');
    // Allow grouping to shift while typing, but keep invalid amounts visible for validation.
    if (!/^\d+(?:\.\d+)*(?:,\d{0,2})?$/.test(value)) return input;
    const [integer, fraction] = value.replace(/\./g, '').split(',');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

export function updateDailyRateInput(input: Pick<HTMLInputElement, 'value' | 'selectionStart' | 'selectionEnd' | 'setSelectionRange'>, inputType = '') {
    const original = input.value;
    const formatted = formatDailyRateInput(original);
    if (original === formatted) return;
    const position = (offset: number | null) => {
        const meaningful = original.slice(0, offset ?? original.length).replace(/^\s*Rp\s*/i, '').replace(/\./g, '').length;
        let count = 0;
        let index = 0;
        while (index < formatted.length && count < meaningful) {
            if (formatted[index] !== '.') count++;
            index++;
        }
        return index;
    };
    let start = position(input.selectionStart);
    let end = position(input.selectionEnd);
    if (inputType === 'deleteContentForward' && formatted[start] === '.') start++;
    if (inputType === 'deleteContentForward' && formatted[end] === '.') end++;
    input.value = formatted;
    input.setSelectionRange(start, end);
}

export function dailyRateValue(value: string): string {
    return formatDailyRateInput(value.replace('.', ','));
}

export function displayDailyRate(value: string): string {
    return `Rp ${dailyRateValue(value)}`;
}
