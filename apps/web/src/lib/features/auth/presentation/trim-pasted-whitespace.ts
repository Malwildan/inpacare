export function trimPastedWhitespace(event: {
    inputType?: string;
    currentTarget: { value: string };
}) {
    if (event.inputType === 'insertFromPaste') {
        event.currentTarget.value = event.currentTarget.value.trim();
    }
}
