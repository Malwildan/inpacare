# UI components

InpaCare uses the actual shadcn-svelte registry source as its general UI foundation. The editable `.svelte` files under `apps/web/src/lib/shared/ui/<component>/` are installed components, not a separate handwritten replacement library. Bits UI supplies interactive behavior; Tailwind supplies the theme and utility styles.

## Ownership

| Location | Responsibility |
| --- | --- |
| `apps/web/components.json` | Registry and aliases into `shared`, with Tailwind CSS at `src/app.css` |
| `apps/web/src/app.css` | InpaCare colors, DM Sans, semantic tokens, accessibility and application typography |
| `shared/ui/button`, `input`, `native-select`, `textarea`, `card`, `table`, `badge`, `dialog`, `alert-dialog`, `sheet`, `popover`, `breadcrumb`, `field`, `label`, `separator` | Registry component source and its local variants |
| `shared/ui/dialog-frame.svelte` | Shared composition of registry Dialog for callback-driven feature dialogs, pending-dismissal protection and focus return |
| `shared/ui/status-badge.svelte` | Shared composition of registry Badge with Indonesian clinical/task labels and semantic tones |
| `app/shell` | Role-filtered navigation, mobile Sheet, breadcrumbs and notification Popover |
| `features/*/presentation` | Feature content, forms, field names, tables, board/schedule layouts and transient state |

Import components from their own `index.js`, for example `$lib/shared/ui/button/index.js`. Keep domain and feature imports out of shared UI. Avoid a wrapper for each registry component; compose them at the feature that needs them.

## Local customizations

- Theme tokens keep the InpaCare blue identity and readable clinical status colors. Use `muted-foreground` for secondary text; `muted` is a background color.
- Button defaults to `type="button"`. A form's submitting Button must explicitly specify `type="submit"`.
- Form controls keep their names, values, native validation and FormData behavior. Native Select is the registry component, including its native option semantics.
- Feature actions generally use 44px targets. Tables and the room schedule scroll inside their containers on narrow screens.
- Badge variants carry status text as well as color. Never rely on color alone.
- Controlled reason dialogs keep drafts on rejection and dismissal. Busy dialogs prevent dismissal and duplicate writes. Successful writes refresh server data; errors must not present unsaved changes as saved.
- The task move dialog retains the settled board behavior: it can be dismissed while its request finishes. The board keeps the card pending and prevents another move of that card until the response arrives.
- Preserve decimal-string money, `expectedVersion`, roles and date/time serialization when changing markup. The API owns calculations, authorization and mutation rules.
- Card Title is a generic container. Use a real heading or give it `role="heading"` and the appropriate `aria-level` when it names a section.
- Registry overlays use portals. Scope layout CSS deliberately; a Svelte selector attached to a parent does not automatically style DOM created inside another component or portal.

## Reviewing upstream changes

1. Start from a clean branch and inspect the installed component, its callers and the local customizations above.
2. Compare the matching component from the [official shadcn-svelte registry](https://www.shadcn-svelte.com/docs). Generate or fetch an update in a disposable checkout first; do not blindly overwrite customized files.
3. Review the source diff and dependency/lockfile changes together. Keep feature behavior out of registry source and retain justified local variants.
4. Run `npm run check --workspace apps/web`, `npm run check:web:architecture`, `npm run test:web` and the production web build. Use `npm run test:web:ux` for focused keyboard, focus, pending, conflict and responsive checks at the service-prop seam.
5. Run the [synthetic browser workflows](BROWSER_TESTS.md) for affected features against a disposable API/database. A component fixture pass does not establish API integration. Check 390px, tablet and desktop rendering, reduced motion, nested overlays and hydration errors.

Swagger UI at `/api-docs` is an independently styled API explorer. Application theme changes should not override its controls.
