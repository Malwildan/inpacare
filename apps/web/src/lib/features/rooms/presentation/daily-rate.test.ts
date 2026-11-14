import { describe, expect, it } from 'vitest';
import { dailyRateValue, displayDailyRate, formatDailyRateInput, parseDailyRate, updateDailyRateInput } from './daily-rate';

describe('daily rate amounts', () => {
    it.each([
        ['250000', '250000'],
        ['250.000', '250000'],
        ['Rp 250.000,50', '250000.50'],
        [' rp\u00a0250.000,05 ', '250000.05'],
        ['0,10', '0.10'],
        ['000250', '250'],
        ['250.000,', '250000'],
        ['9.007.199.254.740.993,01', '9007199254740993.01']
    ])('parses %s as an exact API decimal string', (input, expected) => {
        expect(parseDailyRate(input)).toBe(expected);
    });

    it.each(['', '-100', 'abc100', '1e3', '1.23', '1..000', '1,234', '1,2,3', 'Rp'])('rejects invalid amount %s', (input) => {
        expect(parseDailyRate(input)).toBeNull();
    });

    it.each([
        ['250000', '250.000'],
        ['250.0000', '2.500.000'],
        ['Rp 250.000,50', '250.000,50'],
        ['250000,', '250.000,'],
        ['', ''],
        ['-100', '-100'],
        ['abc100', 'abc100'],
        ['1,234', '1,234'],
        ['1..000', '1..000']
    ])('formats editable input %s without dropping invalid characters or decimals', (input, expected) => {
        expect(formatDailyRateInput(input)).toBe(expected);
    });

    it.each(['0', '250000.50', '0.01', '9007199254740993.01'])('round trips stored amount %s through editing', (value) => {
        expect(parseDailyRate(dailyRateValue(value))).toBe(value);
    });

    it('displays stored decimals as rupiah without losing precision', () => {
        expect(displayDailyRate('250000.50')).toBe('Rp 250.000,50');
        expect(displayDailyRate('9007199254740993.01')).toBe('Rp 9.007.199.254.740.993,01');
    });
});

describe('daily rate input selection', () => {
    it.each([
        ['1000', 4, '', '1.000', 5],
        ['12.3000', 4, '', '123.000', 3],
        ['1000', 1, 'deleteContentBackward', '1.000', 1],
        ['1000', 1, 'deleteContentForward', '1.000', 2],
        ['Rp 250.000,50', 13, 'insertFromPaste', '250.000,50', 10],
        ['', 0, 'deleteContentBackward', '', 0]
    ])('keeps editing position for %s at %i', (value, cursor, inputType, expected, expectedCursor) => {
        const input = {
            value,
            selectionStart: cursor,
            selectionEnd: cursor,
            setSelectionRange(start: number | null, end: number | null) {
                this.selectionStart = start ?? 0;
                this.selectionEnd = end ?? 0;
            }
        };
        updateDailyRateInput(input, inputType);
        expect(input.value).toBe(expected);
        expect(input.selectionStart).toBe(expectedCursor);
        expect(input.selectionEnd).toBe(expectedCursor);
    });
});
