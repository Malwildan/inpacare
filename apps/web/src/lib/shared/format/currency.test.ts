import { describe, expect, it } from 'vitest';
import { moneyInputValue, money, formatMoneyInput, parseMoneyInput, updateMoneyInput } from './currency';

describe('rupiah amounts', () => {
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
        expect(parseMoneyInput(input)).toBe(expected);
    });

    it.each(['', '-100', 'abc100', '1e3', '1.23', '1..000', '1,234', '1,2,3', 'Rp'])('rejects invalid amount %s', (input) => {
        expect(parseMoneyInput(input)).toBeNull();
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
        expect(formatMoneyInput(input)).toBe(expected);
    });

    it.each(['0', '250000.50', '0.01', '9007199254740993.01'])('round trips stored amount %s through editing', (value) => {
        expect(parseMoneyInput(moneyInputValue(value))).toBe(value);
    });

    it('displays stored decimals as rupiah without losing precision', () => {
        expect(money('250000.50')).toBe('Rp 250.000,50');
        expect(money('9007199254740993.01')).toBe('Rp 9.007.199.254.740.993,01');
    });

    it.each([
        ['0.00', 'Rp 0'],
        ['250000', 'Rp 250.000'],
        ['250000.50', 'Rp 250.000,50'],
        ['-250000.50', '-Rp 250.000,50'],
        [250000.5, 'Rp 250.000,50'],
        [-250000.5, '-Rp 250.000,50'],
        [250000, 'Rp 250.000'],
        [0.1 + 0.2, 'Rp 0,30']
    ])('uses the same rupiah display for %s', (value, expected) => {
        expect(money(value)).toBe(expected);
    });

    it.each(['', '-100', 'abc100', '1,234', '1..000'])('keeps invalid bound input %s visible for validation', (value) => {
        expect(moneyInputValue(value)).toBe(value);
    });

    it('formats replaced and reset canonical values without retaining the previous display', () => {
        expect(moneyInputValue('250000.50')).toBe('250.000,50');
        expect(moneyInputValue('12.05')).toBe('12,05');
        expect(moneyInputValue('0')).toBe('0');
        expect(moneyInputValue('')).toBe('');
    });
});

describe('rupiah input selection', () => {
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
        updateMoneyInput(input, inputType);
        expect(input.value).toBe(expected);
        expect(input.selectionStart).toBe(expectedCursor);
        expect(input.selectionEnd).toBe(expectedCursor);
    });
});
