import { expect, it } from 'vitest';
import { trimPastedWhitespace } from './trim-pasted-whitespace';

it.each([
    ['  rina  ', 'rina'],
    ['\t\u00a0rina\u00a0\t', 'rina'],
    ['  InpaCareDemo!2026  ', 'InpaCareDemo!2026'],
    ['  two words  ', 'two words'],
    ['   ', '']
])(
    'removes surrounding whitespace after paste: %j', (value, expected) => {
        const input = { value };
        trimPastedWhitespace({ inputType: 'insertFromPaste', currentTarget: input });
        expect(input.value).toBe(expected);
    }
);

it.each(['insertText', 'deleteContentBackward', 'insertReplacementText', undefined])(
    'preserves typed and autofilled passwords: %s', (inputType) => {
        const input = { value: '  two words  ' };
        trimPastedWhitespace({ inputType, currentTarget: input });
        expect(input.value).toBe('  two words  ');
    }
);
