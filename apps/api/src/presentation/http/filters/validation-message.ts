import type { ValidationError } from "class-validator";

export function validationMessage(errors: ValidationError[]): string | undefined {
  for (const error of errors) {
    // class-validator supplies these two messages even with dismissDefaultMessages.
    const curated = Object.entries(error.constraints ?? {}).find(
      ([rule, message]) => rule !== "whitelistValidation" && rule !== "unknownValue" && message,
    );
    if (curated) return curated[1];
    const nested = validationMessage(error.children ?? []);
    if (nested) return nested;
  }
}
