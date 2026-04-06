# CSS Audit & Convention

## Goal

Fix CSS/inline style conflicts and establish a clear convention in CLAUDE.md.

## Approach

**A) Audit conflicts**

Scan all components for cases where a CSS class and inline `style={{}}` both set the same property. These are the problematic ones.

**B) Fix conflicts only**

For each conflict found, decide:
- If the value is static → move to CSS class, remove inline
- If the value is truly dynamic at render time → keep inline, remove CSS class conflict

**C) Update CLAUDE.md**

Add to conventions:
> **Inline styles vs CSS classes**: Prefer CSS classes for layout, typography, colors, states, pseudo-selectors, and media queries. Use inline `style={{}}` only for values computed at render time (e.g., `transform` from drag, dynamic colors from priority, opacity from dim state). Avoid having both CSS class and inline style set the same property.

## Scope

This is a targeted audit — not a full refactor of all inline styles to CSS.

## Files to Audit

- `client/src/components/TaskCard.tsx`
- `client/src/components/ColumnCard.tsx`
- `client/src/components/TaskDrawer.tsx`
- `client/src/components/BoardView.tsx`
- `client/src/components/HeaderToolbar.tsx`
- `client/src/components/*.tsx` (all components)

## Conflict Detection Method

1. List all CSS class definitions in `index.css`
2. List all inline `style={{}}` instances per component
3. For each component, check if any inline style property name matches a property in the relevant CSS class for that element
4. Flag for human decision

## Out of Scope

- Converting all inline styles to CSS (just conflicts)
- Moving non-conflicting inline styles to CSS
- Adding new CSS classes for currently-inline-only styles
