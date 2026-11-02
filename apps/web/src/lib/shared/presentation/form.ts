export function formText(form: FormData, name: string): string {
    return String(form.get(name) ?? '');
}
