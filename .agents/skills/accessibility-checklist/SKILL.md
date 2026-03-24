---
name: accessibility-checklist
description: |
  Accessibility review checklist for React/Next.js components built on Radix UI / shadcn/ui.
  Covers component library misuse, form accessibility, accessible names, keyboard interaction,
  focus management, and dynamic content. Loaded by pr-review-frontend.
user-invocable: false
disable-model-invocation: true
---

# Accessibility Review Checklist

## How to Use This Checklist

- Review changed components against the relevant sections below
- Not every section applies to every component — form checks only apply to form components, modal checks only apply to modals, etc.
- **This codebase uses Radix UI / shadcn/ui extensively.** These libraries handle most a11y patterns (keyboard nav, focus management, ARIA) automatically. Your primary job is to catch **misuse** of the library, not absence of manual implementation.
- When unsure whether a component library handles a pattern, lower confidence rather than asserting

---

## §1 Component Library Misuse (Radix / shadcn/ui)

This is the **highest-signal section** for this codebase. Radix handles a11y correctly when used correctly — bugs come from misuse.

- **Dialog/Sheet without title**: Radix `Dialog` and `Sheet` require `DialogTitle` / `SheetTitle` for screen reader announcement. If `DialogTitle` is omitted or visually hidden without `aria-label` on `DialogContent`, screen readers announce an unlabeled dialog.
  - Common violation: `<DialogContent>` with no `<DialogTitle>` and no `aria-label`
  - Note: Using `<VisuallyHidden><DialogTitle>...</DialogTitle></VisuallyHidden>` is a valid pattern for dialogs where a visible title doesn't fit the design

- **AlertDialog without description**: `AlertDialogContent` should include `AlertDialogDescription` for screen readers to understand the confirmation context. If omitted, add `aria-describedby={undefined}` to explicitly opt out (otherwise Radix warns).

- **Select/Combobox without accessible trigger label**: Radix `Select` needs `aria-label` on the trigger when there's no visible label. Custom `generic-select.tsx` and `generic-combo-box.tsx` wrappers should propagate labels.
  - Common violation: `<Select>` inside a form field that has a visual label, but the label isn't associated via `htmlFor` or wrapping

- **DropdownMenu items without accessible names**: Icon-only menu items need text content or `aria-label`. Menu items that are just icons (e.g., copy, delete, edit) need text.
  - Correct pattern: `<DropdownMenuItem><TrashIcon /> Delete</DropdownMenuItem>` (icon + text)
  - Violation: `<DropdownMenuItem><TrashIcon /></DropdownMenuItem>` (icon only, no text, no aria-label)

- **Tooltip as only accessible name**: Tooltip text is not reliably announced by all screen readers. If a control's only accessible name is in a tooltip, it needs `aria-label` as well.
  - Common pattern to flag: `<Tooltip><TooltipTrigger><Button><Icon /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>` — Button needs `aria-label="Delete"`

- **Overriding Radix's keyboard handling**: If a component wraps a Radix primitive and adds `onKeyDown` that calls `e.preventDefault()` or `e.stopPropagation()`, it may break Radix's built-in keyboard navigation.

---

## §2 Forms & Labels

The codebase uses react-hook-form + Zod with shadcn/ui's `Form` component, which auto-associates labels via `FormItem` context. Issues arise when forms bypass this pattern.

- **Every form input must have an accessible name**: Via `<FormLabel>`, `<label htmlFor={id}>`, `aria-label`, or `aria-labelledby`. Placeholder text alone is NOT a label.
  - Common violation: Custom inputs outside `<FormField>` / `<FormItem>` that don't get auto-association
  - Common violation: `<Input placeholder="Enter name" />` used standalone without any label

- **Error messages must be associated with their input**: shadcn/ui's `<FormMessage>` auto-associates via `aria-describedby` when inside `<FormItem>`. Custom error rendering outside this pattern loses the association.
  - Flag: Error text rendered near an input but not using `<FormMessage>` or manual `aria-describedby`

- **Required fields must be indicated programmatically**: Use `aria-required="true"` or native `required`, not just a visual asterisk. The `Form` component doesn't add this automatically — it comes from the Zod schema validation at submit time, not at the HTML level.

- **Grouped controls need group semantics**: Radio groups and checkbox groups should use `<RadioGroup>` (Radix) or `<fieldset>`/`<legend>`. Loose radio buttons or checkboxes without group context confuse screen readers.
  - Scope: Configuration pages, settings forms, multi-option selectors

---

## §3 Accessible Names (Icons & Buttons)

With 48 shadcn/ui components and heavy icon usage (Lucide React), icon-only interactive elements are a primary risk area.

- **Icon-only buttons must have `aria-label`**: Buttons containing only an icon (no visible text) need `aria-label` describing the action.
  - Common violation: `<Button variant="ghost" size="icon"><TrashIcon /></Button>` without `aria-label`
  - Very common in: data tables (row actions), toolbars, card headers, dialog close buttons
  - Note: shadcn/ui's `Dialog` close button already includes `<span className="sr-only">Close</span>` — don't flag this

- **Icon-only links need accessible names**: Same as buttons — `<a>` or `<Link>` with only an icon needs `aria-label`.

- **`sr-only` text is a valid alternative to `aria-label`**: `<Button><TrashIcon /><span className="sr-only">Delete item</span></Button>` is correct. Don't flag this pattern as missing a label.

- **Decorative icons should be hidden**: Icons that are purely decorative (next to visible text) should have `aria-hidden="true"` to avoid redundant announcements.
  - Correct: `<Button><PlusIcon aria-hidden="true" /> Add item</Button>`
  - Also correct: Lucide icons may set `aria-hidden` by default — check before flagging

---

## §4 Semantic HTML & Regression Guard

The codebase currently has no `<div onClick>` anti-patterns. This section guards against regressions.

- **Interactive elements must use native interactive HTML**: `<button>` for actions, `<a>`/`<Link>` for navigation. NOT `<div>`, `<span>`, or `<p>` with `onClick`.
  - Flag any new `<div onClick>` or `<span onClick>` in the diff as CRITICAL
  - Exception: Components from Radix that render proper elements under the hood are fine

- **Tables must use semantic HTML**: `<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>`. The codebase already does this. Flag any new data display that should be a table but uses `<div>` grid instead.
  - Consider: `<th>` elements should have `scope="col"` or `scope="row"` for complex tables

- **Don't disable zoom**: Flag `user-scalable=no` or `maximum-scale=1` in viewport meta tags.

---

## §5 Focus Management

Radix Dialog handles focus trap and restore automatically. This section covers what Radix doesn't handle.

- **Custom modals/overlays must manage focus**: Any modal-like UI NOT built on Radix Dialog (e.g., custom overlays, fullscreen panels, React Flow side panels) must:
  - Move focus into the overlay when it opens
  - Trap focus while open (Tab cycles within the overlay)
  - Return focus to the trigger when closed
  - Close on Escape

- **Focus visible indicator must not be removed**: `outline-none` / `outline: none` without a `focus-visible:ring-*` replacement removes the only visual cue for keyboard users.
  - Note: The codebase consistently uses `focus-visible:ring-*` alongside `outline-none` — this is correct. Only flag if a new component uses `outline-none` without the replacement.

- **Route change focus (Next.js App Router)**: After client-side navigation, focus should move to the main content. Next.js App Router may handle this — only flag if a custom route change mechanism bypasses the framework's handling.

- **Positive tabIndex is an anti-pattern**: `tabIndex={0}` and `tabIndex={-1}` are fine. `tabIndex={1}` or higher overrides natural order and creates unpredictable navigation. Flag any positive tabIndex values.

---

## §6 Dynamic Content & Live Regions

With 287 toast usages (Sonner) and chat streaming interfaces, announcements for screen readers matter.

- **Sonner toasts**: Sonner uses `role="status"` with `aria-live="polite"` by default. This is correct. Only flag if:
  - A custom toast/notification bypasses Sonner and doesn't use a live region
  - An error toast should use `role="alert"` (assertive) instead of `role="status"` (polite) for critical errors

- **Loading states should be communicated**: Skeleton loaders and spinners should be accompanied by screen reader announcements. Options:
  - `aria-busy="true"` on the loading container
  - `<span className="sr-only">Loading...</span>` inside the spinner
  - `aria-live="polite"` region that announces "Loading..." then announces when content is ready
  - Note: The codebase's `Spinner` component already has `aria-label` — check that new loading patterns follow suit

- **Chat streaming messages**: For the copilot/playground chat interfaces, new messages should be announced to screen readers. The `@inkeep/agents-ui` library should handle this — only flag if custom chat rendering bypasses the library's announcements.

- **Inline form validation**: When validation errors appear dynamically (without page reload), they should either:
  - Be associated with the input via `aria-describedby` (shadcn/ui's `<FormMessage>` does this)
  - Or use `aria-live="polite"` to announce the error
  - Only flag custom validation rendering outside the `<FormMessage>` pattern

---

## §7 Specialized Components

These components have unique a11y considerations beyond standard patterns.

- **Monaco Editor**: Has known a11y limitations for screen reader users. When Monaco is used for required input (not just optional code editing), consider providing an alternative text input fallback. Flag only if a new Monaco instance is introduced without consideration.

- **React Flow (node graph editor)**: Keyboard navigation in visual node editors is inherently difficult. When React Flow is used:
  - Ensure all node operations are also accessible via context menus or keyboard shortcuts
  - Node labels should be readable by screen readers
  - Flag only if new React Flow interactions are added without keyboard alternatives

- **Data tables with actions**: Tables with row-level action buttons (common in this codebase) should ensure action buttons have accessible names and the table structure allows screen reader navigation.
  - Flag: New table action buttons that are icon-only without `aria-label`

---

## Severity Calibration

| Finding | Severity | Rationale |
|---|---|---|
| `<div onClick>` or `<span onClick>` (non-semantic interactive element) | CRITICAL | Completely blocks keyboard/screen reader users |
| Keyboard trap (user cannot Tab out of a component) | CRITICAL | Completely blocks keyboard users |
| Custom modal without focus management (not using Radix Dialog) | MAJOR | Major disorientation for keyboard/screen reader users |
| Form input without accessible name (no label, no aria-label) | MAJOR | Screen reader users cannot identify the input |
| Icon-only button without `aria-label` or `sr-only` text | MAJOR | Screen reader users cannot identify the action |
| Dialog without DialogTitle and no aria-label | MAJOR | Screen reader users don't know what the dialog is for |
| `aria-hidden="true"` on container with focusable children | MAJOR | Creates ghost focus for screen reader users |
| Error message not associated with input (outside FormMessage) | MAJOR | Screen reader users don't know about validation errors |
| `outline-none` without `focus-visible:ring` replacement | MAJOR | Keyboard users lose their place |
| Radix keyboard handling overridden via stopPropagation | MAJOR | Breaks built-in a11y of the component library |
| Missing alt text on informational image | MINOR | Information not conveyed, but usually not blocking |
| Decorative icon missing `aria-hidden="true"` | MINOR | Redundant announcement — annoying, not blocking |
| Custom notification/toast without live region | MINOR | Status not announced, but visually evident |
| Redundant ARIA on native elements | MINOR | Noise, not breakage — indicates misunderstanding |
| Missing `scope` on `<th>` in complex tables | INFO | Navigation degraded in complex tables, not blocking |
