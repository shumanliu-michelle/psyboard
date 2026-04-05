# Task Card Kebab Menu — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Summary

Replace the three horizontal icon buttons (assignee, edit, delete) on each TaskCard with a single vertical "kebab" menu icon (⋮). Clicking reveals a dropdown with all three actions.

## Design

### Current State
Three inline icon buttons in the top-right corner of each TaskCard:
- Person icon → opens assignee selector
- Pencil icon → enables inline edit mode
- Cross icon → deletes the task

### Proposed Change

**Kebab icon** (vertical dots ⋮) replaces the three icons. It is positioned top-right, same as the current icons.

**Dropdown menu** appears on click with three items:
1. **Assign** — opens the assignee selector inline (reuses existing `showAssign` popover logic)
2. **Edit** — enters inline edit mode (same as current pencil behavior)
3. **Delete** — deletes the task (same as current cross behavior)

### Visual Details
- Kebab icon: 3 vertical dots (each ~4×4px circle), spaced 3px apart, color `#888`
- Dropdown: white background, `1px solid #e5e7eb` border, `6px` border-radius, `0 4px 12px rgba(0,0,0,0.1)` box-shadow
- Dropdown position: anchored top-right of the kebab icon, appearing below or above depending on space
- Menu items: `Assign`, `Edit`, `Delete` as text buttons (or icon + text), left-aligned

### Interaction
- Click kebab icon → toggle dropdown open/closed
- Click outside dropdown → close dropdown
- Click Assign → closes dropdown and opens the existing assignee selector popover
- Click Edit → enters inline edit mode
- Click Delete → deletes the task

## Components
- **KebabIcon** — inline SVG, 3 vertical dots, 14×14 viewBox, color inherited
- **TaskCard dropdown** — styled popover with menu items, click-outside-to-close behavior

## Implementation Notes
- Reuse existing `showAssign` state and popover logic for the Assign action
- Reuse existing `editing` state for the Edit action
- Reuse existing `handleDelete` for the Delete action
- Popover positioning may need adjustment if the kebab menu is near card edges (Y direction flip)

## Out of Scope
- Changes to assignee options or behavior
- Changes to edit mode UX
- Changes to delete confirmation
