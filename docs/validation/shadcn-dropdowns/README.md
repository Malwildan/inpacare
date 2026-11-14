# shadcn dropdown menus

These synthetic captures show the actual task-filter components with the shadcn Select menu open at 390px and 1440px. The application shell is excluded. They are produced by `npm run test:web:ux` with the actual registry Select source, including long option labels, menu scrolling, keyboard selection and focus return.

- [390px menu](patient-menu-390.png)
- [1440px menu](patient-menu-1440.png)

The focused harness also checks required-field validation, empty filter values, exact service payloads, selections inside dialogs, failed-save drafts, and editable billing suggestions. Full API/SSR acceptance is covered separately by the production browser suite in CI.
