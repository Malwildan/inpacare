# Tugas Perawatan: Trello-like Kanban board and card movement

## Problem Statement

Perawat PIC and Koordinator Perawat use Tugas Perawatan to understand patient work, identify responsibility, and advance tasks. The current board groups cards by status, but its four-column grid becomes two columns and then a vertical stack on smaller screens. Large summary and filter sections compete with the board, cards have no drag interaction, and status changes depend on action buttons. Tasks are ordered by schedule rather than a saved board position.

The board also divides one globally paginated batch of 50 tasks among all four columns. A short or empty column can therefore describe the current page rather than the actual work in that status. Users need the familiar Trello interaction of scanning horizontal lists, opening a card, moving it between allowed stages, and arranging cards within a list, with changes that survive reloads.

## Solution

Make Tugas Perawatan feel like a Trello board inside the existing InpaCare application: a compact toolbar above a horizontally scrollable canvas, fixed-width rounded lists, dense readable cards, clear drag feedback, persistent card ordering, and a card-detail dialog. Keep Indonesian domain labels and the existing care-task rules.

The four lists remain Belum Dikerjakan, Sedang Dikerjakan, Selesai, and Dibatalkan. A permitted move updates the real task and its history. A forbidden move never changes clinical state. Mouse, touch, and keyboard users can perform equivalent permitted actions. Each list loads its own cards and reports its own total.

## User Stories

1. As a Perawat PIC, I want my assigned tasks grouped into the four familiar status lists, so that I can understand my workload at a glance.
2. As a Koordinator Perawat, I want to see all tasks in my authorized ward scope, so that I can coordinate work across PICs.
3. As a board user, I want lists arranged horizontally at desktop and mobile widths, so that the board keeps a consistent spatial layout.
4. As a board user, I want to scroll a long list while its heading remains visible, so that I always know the status I am reviewing.
5. As a board user, I want compact cards with title, patient, room, priority, schedule, and PIC, so that I can assess work without opening every card.
6. As a board user, I want readable priority text and status labels as well as color, so that I can understand the board without relying on color alone.
7. As a board user, I want the full task title available when card content is long, so that similar tasks remain distinguishable.
8. As a board user, I want a card click or keyboard activation to open its details, so that I can read the description, notes, and history.
9. As a board user, I want closing details to return focus and my scroll position to the originating card, so that I can continue where I left off.
10. As a Perawat PIC, I want to drag my task from Belum Dikerjakan to Sedang Dikerjakan, so that I can record that work has started.
11. As a Perawat PIC, I want to drag my task from Sedang Dikerjakan to Selesai, so that I can record completion.
12. As a Koordinator Perawat, I want to perform the same permitted forward transitions for tasks in my scope, so that I can manage authorized work.
13. As a board user, I want allowed drop targets, an insertion placeholder, and a visible dragged card, so that I can predict the result before releasing it.
14. As a board user, I want dragging near a board or list edge to reveal the destination by scrolling, so that off-screen positions remain reachable.
15. As a board user, I want Escape or releasing outside a valid target to cancel a drag, so that an abandoned gesture makes no saved change.
16. As a board user, I want rejected status destinations to explain the restriction, so that I do not accidentally skip, reverse, or reopen a care stage.
17. As a Koordinator Perawat, I want a drop into Dibatalkan to collect and confirm a cancellation reason, so that cancellation remains intentional and auditable.
18. As a Koordinator Perawat, I want cancelling that confirmation to leave the task in its original state, so that an incomplete cancellation does not change care work.
19. As an authorized board user, I want to rearrange cards within their current list and retain that order after reload, so that the arrangement is useful beyond the current session.
20. As a board user, I want ordering changes to leave task priority, schedule, assignment, and clinical status intact, so that visual arrangement cannot silently rewrite care details.
21. As a keyboard or touch user, I want a clearly labeled Pindahkan action with permitted destinations and position controls, so that dragging is never required.
22. As a touch user, I want ordinary scrolling and tapping to remain reliable, so that an incidental gesture does not move a task.
23. As a board user using assistive technology, I want movement, saving, completion, and errors announced with meaningful task and destination names, so that I can follow the result.
24. As a board user, I want search and the existing status, priority, room, patient, PIC, and date filters available in a compact filter panel, so that I can narrow work without losing the board.
25. As a board user, I want applied filters visible and removable, so that I understand why cards are missing.
26. As a board user, I want each list to distinguish loaded cards from its total matching count, so that I do not mistake a partial list for the full workload.
27. As a board user, I want to load additional cards in one list independently, so that a busy list does not hide cards in another status.
28. As a board user, I want a moved card that no longer matches my filter to disappear with a clear success message, so that filtered results remain trustworthy.
29. As a board user, I want an empty list, a list hidden by filters, and a failed load to have distinct states, so that missing cards are not misleading.
30. As a Koordinator Perawat, I want Buat tugas and an add-card affordance in Belum Dikerjakan to open the validated creation form, so that creating work feels natural without omitting required patient-placement and PIC details.
31. As an authorized task user, I want notes and history available in the card dialog, so that I can record actions and inspect what changed.
32. As a Koordinator Perawat, I want existing detail editing, PIC reassignment, cancellation, and logical deletion available according to their current rules, so that the new board retains management capabilities.
33. As a board user, I want pending saves to be visible and duplicate moves prevented, so that repeated input does not submit the same change twice.
34. As a board user, I want a failed move to restore the confirmed card state and preserve relevant input, so that an optimistic preview is never mistaken for a saved change.
35. As a board user, I want a stale-version conflict to refresh the affected lists and explain the conflict, so that I can decide again using current data.
36. As a former PIC, I want reassigned tasks to disappear from my access after refresh or a rejected operation, so that the board respects current responsibility and patient scope.
37. As a board user, I want accepted status, order, and history changes to remain correct after reload and in another authorized session, so that the board reflects durable shared state.

## Implementation Decisions

### Scope and architecture

- Extend the existing tasks feature in the SvelteKit frontend and NestJS API. Retain feature-first Clean Architecture: presentation manages gestures and transient state, task operations express intent, and the HTTP adapter owns wire contracts. Reuse existing shared dialog, form, icon, transport, and session handling where appropriate.
- This specification covers both appearance and core card behavior, including durable within-list ordering. Browser-only array sorting is not sufficient. The existing shared ward board remains the product model; do not introduce multiple boards, workspaces, or tenants.
- Preserve all four existing status values and Indonesian labels. Keep list order fixed to the care workflow. Board arrangement never changes task priority, dates, placement, or PIC.

### Appearance and layout

- Use Trello's list-and-card composition as the reference, while retaining the InpaCare application shell, typography, and navigation. Apply a calm tinted board canvas, light neutral list surfaces, white cards, restrained borders/shadows, and clear hover/focus states.
- At desktop widths, target list widths around 280–304 CSS pixels, 12-pixel list gaps, rounded list containers, and smaller rounded cards with compact padding. Keep lists at a readable width rather than stretching or compressing them to fill four equal grid tracks.
- The board scrolls horizontally on smaller screens, with a neighboring-list edge visible where space permits. Each list has bounded vertical scrolling and a persistent heading. Keep horizontal scrolling inside the board; the application shell and toolbar must fit a 390-pixel viewport.
- Put the page title, primary create action, search, and filter access in a compact toolbar. Move the existing large summary treatment into list headings or a concise summary row. Put advanced filters in an expandable panel with applied-filter indicators and a reset action.
- Cards prioritize the task title, then patient and room, compact priority and schedule metadata, and PIC identity. Show names even if an initials avatar is used. Long titles must remain accessible in full; long metadata must wrap or expose its full value through an accessible control.
- Use visible text for priority and due-time meaning. Any overdue cue is derived from the existing end instant and applies only to unfinished tasks; it must not imply a new clinical priority or write a new status.

### Card movement and authorization

- Keep the API authoritative for session, nurse role, task scope, and transitions. A non-coordinator PIC can operate only on currently assigned tasks. A Koordinator Perawat can operate on tasks in the existing coordinator scope.
- The permitted status graph remains Belum Dikerjakan to Sedang Dikerjakan to Selesai. Koordinator Perawat can also cancel from either unfinished status with a nonblank reason. Skipping stages, moving backward, and reopening a completed or cancelled task remain disallowed. Do not implement a skipped stage as multiple automatic requests.
- Permit position-only rearrangement within the same list for the current PIC or coordinator, including within a terminal list. This changes arrangement only; terminal status cannot change. Apply version checks and history to this new write just as to other task writes.
- Dragging shows a card preview and a destination insertion marker. Only valid destinations accept a drop. Empty valid lists have a visible drop area. Escape, an invalid destination, or release outside the board cancels without a mutation. A completed drag must not trigger the card-click dialog.
- A valid drop updates the board preview and shows a saving state. Do not automatically open task details after a successful move. Block another mutation of the same pending card; refresh affected lists and counts after confirmation.
- A drop into Dibatalkan opens a localized dialog for a reason and explicit confirmation before any request. Escape, dismissing the dialog, or selecting Batal restores the original card position. Validation and save failures retain the entered reason.
- Provide a focusable Pindahkan action on each operable card and in task details. Its dialog offers only allowed statuses and positions before a visible card or at the end of a list. Use the same task operation as drag-and-drop. Preserve direct Mulai and Selesaikan controls where useful as accessible alternatives.
- Touch dragging must use a deliberate activation gesture and must not capture ordinary list scrolling. The Pindahkan action is the required fallback where touch dragging cannot run reliably. Keyboard users can complete the entire move through labeled dialog controls without emulating a pointer drag.
- Focus returns to the moved card when it remains visible, or to the source list heading when it leaves the filter. Announce the task, destination, and save result. Respect reduced-motion preferences, provide visible focus, keep controls large enough for touch, and avoid color-only targets.

### Persistence, contracts, and concurrency

- Add a server-owned position for each task within its status list through an additive migration. Initialize existing cards in their current schedule-then-ID order. New tasks append to Belum Dikerjakan; a status change without a requested position appends to its destination list. Reassignment and detail edits retain the existing board position.
- Keep one shared canonical order per status in the existing ward scope. Each actor sees only authorized tasks in that order. Reordering a visible card relative to another visible card never reveals hidden tasks or accepts an out-of-scope anchor.
- Extend task listing with an explicit board-order option; preserve the existing default schedule order for current consumers. Use the existing status/filter and bounded limit/offset capabilities to load each column independently, initially 50 cards per list, with the existing maximum of 100 per request.
- Add a named task-move operation and an additive `POST /api/v1/tasks/{id}/move` contract accepting the task's `expectedVersion`, destination `status`, a nullable `beforeTaskId` anchor, and a cancellation `reason` when required. A null anchor means append to the destination's full list. The returned task includes its confirmed version; internal ranking values need not become client-managed fields.
- Route both the new move operation and existing status-update operations through the same status policy and ordering behavior. Validate the moved task and any anchor against the actor's scope and the destination status. Reject self-anchors and malformed requests. Do not accept a browser-supplied whole list of task IDs or positions as authority.
- Commit status, position, version, and the corresponding history entry atomically. Serialize conflicting source/destination list changes with a consistent locking order. Record one history entry per accepted movement; use a distinct ordering action for position-only moves. A same-position drop is a no-op without a new version or history entry.
- Preserve existing error semantics: stale task versions are conflicts; invalid status changes or missing cancellation reasons are validation errors; expired sessions use the existing session flow; inaccessible tasks/anchors must not disclose whether hidden records exist. Changed/deleted anchors must produce a recoverable conflict or scope-appropriate rejection, never a guessed insertion.
- On a conflict or network/server failure, discard the optimistic preview, obtain the authoritative state where possible, and display a localized message. When refresh also fails, retain the last confirmed snapshot with an explicit refresh/retry state; do not show a successful save. Never automatically replay a status command against a newer version.
- Update the source OpenAPI contract and regenerate API types through the project's existing generator. Update affected ports, adapters, API documentation, and fixtures alongside the implementation. Preserve timezone-bearing task instants, local display/form conversion, CSRF protection, and existing session behavior.

### Filtering, loading, and task details

- Preserve existing search, status, priority, room, patient, PIC, and date filter URL semantics. Keep all four lists visible. A list excluded by the status filter explicitly says it is filtered out rather than presenting an unqualified empty state. Legacy board links carrying the old global page parameter remain valid but open the initial per-list batches with their other filters preserved.
- Each heading reports the server's matching total for its list and distinguishes it from the loaded count. Additional loading and retry belong to that list. Do not infer totals from the number of DOM cards or hide a failed request as an empty result.
- After a successful move, refresh/reset affected list batches so offset changes cannot leave duplicate or skipped cards. A card moved outside the active filter disappears only after confirmation, with a success announcement explaining the destination. Clear stale pending previews before a filter/navigation change.
- With explicit search or filters active, allow valid status changes, appending to the destination list, but disable manual position selection and within-list reordering with a short explanation to clear filters first. The actor's normal PIC scope is not an explicit filter: a PIC may order their visible assigned cards using authorized visible anchors.
- Creation always begins in Belum Dikerjakan and retains active-placement, patient, PIC, schedule, and priority validation. A list footer opens the same complete creation form rather than creating an incomplete title-only task. Other status lists do not offer create-in-status actions.
- The detail dialog groups title/context, status, PIC, priority, schedule, description, notes, and activity. Retain current role-dependent edit/reassign/cancel/logical-delete actions and their reasons/version checks. Keep history and before/after values available through expandable details. Failed edits keep form values; closing and reopening the dialog must not alter board position.

## Testing Decisions

- The user confirmed extending the existing Playwright Tugas Perawatan workflow as the main acceptance seam. Exercise the public page through accessible controls and real task operations against an isolated synthetic API/database. Assert user-visible behavior and persisted outcomes, not component internals or the chosen drag library.
- Build on the existing coordinator-creates/PIC-starts/adds-note/reloads/history workflow. Retain its role, persistence, and audit assertions while adding pointer movement, details opened by card activation, and keyboard/touch alternatives. Update assertions that currently depend on every status change opening a dialog.
- Cover both permitted forward transitions, coordinator progress on another PIC's task, cancellation with a reason, cancellation dismissal, invalid skips/backward moves, terminal restrictions, and same-list reordering. Verify reload and a second authorized session observe the accepted canonical order and status.
- Cover an empty destination, beginning/middle/end insertion, drag cancellation, preventing detail opening after a drag, same-position no-ops, and preventing duplicate pending saves. Test meaningful sequences of actions and final outcomes rather than snapshotting every transient animation.
- Intercept the task mutation response in focused browser cases to exercise delayed saves, conflicts, validation rejection, network/server failures, and session expiry. Assert restored confirmed state, retained reason/form values, clear error feedback, and no false success. Include reassignment during a pending action so a former PIC loses access correctly.
- Seed more than 50 tasks in one status and tasks in every other status. Verify truthful per-list totals, independent load-more, no omissions/duplicates after movement and refresh, preservation of filters in URLs, status moves that leave the filter, and filtered-order restrictions. Include long titles, names, and schedule values.
- Check the finished board visually at desktop and 390-pixel widths with synthetic data: list geometry, compact card hierarchy, horizontal overflow confined to the board, independently scrollable lists, visible headers, and readable empty/loading/error states. Verify keyboard-only details/movement, focus restoration, screen-reader announcements, touch scrolling and alternative controls, and reduced motion. Do not claim these checks passed until performed during implementation.
- Retain the existing task-domain and application tests for authorization, the allowed status graph, reasons, and stale versions. Extend the API integration/HTTP contract tests for the new move contract, ordered reads, migration backfill, atomic movement/history, visible-anchor validation, and concurrent moves. Confirm default schedule-sorted callers continue to work and existing status updates maintain board positions correctly.
- Use the current task application/repository-adapter tests for query translation only where the new board-order option changes behavior. Avoid a second component-only acceptance harness; introduce a smaller seam only if a behavior cannot be reliably verified at the existing browser or API boundary.
- Run appropriate frontend type/architecture checks, API type/unit/integration/contract checks, generated-type drift checks, and the focused browser workflow during implementation. This specification itself does not require application builds or database mutations.

## Out of Scope

- Custom statuses; creating, renaming, reordering, or deleting status lists; multiple boards or workspaces.
- Reopening terminal tasks, skipping care stages, changing PIC/coordinator authority, or changing placement validation.
- Trello account integration, importing/exporting boards, attachments, checklists, arbitrary labels, mentions, bulk moves, automations, templates, or calendar/timeline views.
- Live multi-user push synchronization, offline command queues, and automatic retries or undo of clinical transitions. Normal reads and explicit refreshes obtain current shared state.
- Changes to medical records, care cycles, billing, global navigation, authentication, or the rest of the application design.
- Production deployment, real patient data, or implementation in this specification-only task.

## Further Notes

- User request: "in tugas perawatan, make the kanban behavior and appearance like trello one $to-spec". The chosen scope interprets the core Trello behavior as moving cards between permitted lists, arranging cards within lists, opening detailed cards, and preserving saved changes. InpaCare's care-task constraints take precedence over Trello's freely configurable workflow.
- Current implementation inspected at revision `6ac3a87bbff5c530437eabd778d3a3f4e473fd0e` on 2026-11-13. It has schedule-based ordering, global 50-task pagination, status-action buttons, and no persisted position or move operation. The new ordering and per-list loading described above are proposed implementation work, not existing capabilities.
- The checked-in Tugas Perawatan design capture was used only as historical visual context; current source determines present behavior. Trello's public guide image illustrates list/card composition, not a pixel-perfect target for a particular Trello release.
- Primary references checked on 2026-11-13: [Trello board, list, and card basics](https://trello.com/guide/trello-101), [moving and reordering Trello cards](https://support.atlassian.com/trello/docs/moving-cards-or-lists/), and [filtering a Trello board](https://support.atlassian.com/trello/docs/filtering-for-cards-on-a-board/). The layout and permission restrictions in this spec are InpaCare design decisions rather than claims of complete Trello parity.
- The existing browser workflow was confirmed by the user as the primary acceptance approach. No feature implementation, application tests, browser interaction checks, or clinical validation were performed while preparing this spec.
