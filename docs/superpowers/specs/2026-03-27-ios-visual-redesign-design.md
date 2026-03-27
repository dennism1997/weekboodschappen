# iOS Visual Redesign — Design Spec

## Overview

Restyle the Weekboodschappen client to look and feel like a native iOS app. Pure visual/CSS change — no functionality changes, no new components, no dark mode.

## Design Decisions

- **Style:** iOS Native — grouped inset lists, SF-style typography, system gray backgrounds
- **Accent color:** `#B4A0ED` (warm pastel lavender)
- **Light tint:** `#F3EFFC` (for discount badges, subtle highlights)
- **Icons:** Outline SVG icons (Lucide-style) replacing emoji in bottom nav
- **Mode:** Light only

## Design System

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent` | `#B4A0ED` | Buttons, active tab, pills, checkboxes, progress bars |
| `--color-accent-light` | `#F3EFFC` | Discount text badges, suggestion tags, light backgrounds |
| `--color-bg` | `#F2F2F7` | Page background (iOS system gray 6) |
| `--color-surface` | `#FFFFFF` | Cards, grouped lists, tab bar |
| `--color-separator` | `#C6C6C8` | 0.5px dividers between list items |
| `--color-label` | `#1D1D1F` | Primary text |
| `--color-secondary` | `#86868B` | Secondary text, subtitles, detail labels |
| `--color-tertiary` | `#C7C7CC` | Placeholders, unchecked circles, chevrons |
| `--color-destructive` | `#FF3B30` | Delete buttons, logout |
| `--color-segmented-bg` | `#E9E9EB` | Segmented control background |
| `--color-category-bg` | `#EFEFF4` | Category header strips |

### Source badge colors (unchanged semantics)

| Source | Background | Text |
|--------|-----------|------|
| recept | `#E8F0FE` | `#4A7FE5` |
| basis | `#FFF3E0` | `#E09B3D` |
| handmatig | `#F3E8FF` | `#9B59B6` |

### Typography

Use `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif` throughout (already the Tailwind default on Apple devices).

| Element | Size | Weight |
|---------|------|--------|
| Large title (page headings) | 34px | 700 |
| Section header | 13px uppercase | 600 |
| List item title | 17px | 400 |
| List item detail | 13px | 400 |
| Button text | 17px | 600 |
| Small button text | 13px | 600 |
| Tab label | 10px | 500 |
| Badge / pill | 11px | 600 |

### Spacing & Radii

| Element | Radius |
|---------|--------|
| Grouped list container | 12px |
| Primary button | 14px |
| Segmented control | 9px (outer), 7px (inner) |
| Small badge | 6px |
| Pill badge | 10px (full round) |
| Bottom sheet (ScrapeDialog) | 16px top corners |

- List items have `min-height: 44px` (iOS touch target)
- Content area padding: `0 16px`
- Max width: `max-w-lg` (unchanged)
- List item separator: `0.5px` solid, inset from left by 16px

### Bottom Nav (Tab Bar)

- Frosted glass: `background: rgba(249,249,249,0.94)` with `backdrop-filter: blur(20px)`
- Top border: `0.5px solid #C6C6C8`
- Safe area padding at bottom: `pb-[34px]` (or `env(safe-area-inset-bottom)`)
- Icons: outline SVGs (stroke only, 1.5px weight, 24x24)
  - Plan: calendar icon
  - Lijst: checkbox/checklist icon
  - Recepten: book icon
  - Basis: shopping cart icon
  - Instellingen: gear/cog icon
- Active state: icon + label colored `#B4A0ED`
- Inactive state: `#86868B`

### Segmented Control (Store Selector)

Replace pill buttons with iOS segmented control:
- Container: `#E9E9EB` background, 9px radius, 2px padding
- Active segment: white background, subtle shadow, 7px radius
- Used on: MealPlanner (store selector), Settings (store preference)

### Grouped Inset Lists

iOS-style grouped lists used for:
- Recipe items in MealPlanner
- Settings sections (household, store, members, categories)
- Recipe ingredients in RecipeDetail

Pattern:
- White background, 12px radius
- Items separated by 0.5px lines inset 16px from left
- Section headers above in uppercase gray

### Buttons

| Type | Style |
|------|-------|
| Primary | `#B4A0ED` bg, white text, 14px radius, full width, 16px padding |
| Secondary/outline | transparent bg, `#B4A0ED` text, dashed border for "add" actions |
| Destructive | transparent bg, `#FF3B30` text, `#FF3B30` border (logout, delete) |
| Small action | `#B4A0ED` bg, white text, 8px radius (e.g. "+ Plan" on suggestions) |

### Checkboxes / Check Circles

- Unchecked: 24px circle, 2px `#C7C7CC` border
- Checked: 24px circle, filled `#B4A0ED`, white checkmark
- Used in: GroceryList, ShoppingMode, Staples

## Pages — Specific Changes

### Layout.tsx
- Background: `#F2F2F7` (was `bg-gray-50`)
- Bottom padding increased for tab bar safe area

### BottomNav.tsx
- Replace emoji icons with outline SVG icons
- Add frosted glass background with backdrop blur
- Active color: `#B4A0ED` (was `text-green-600`)

### MealPlanner.tsx
- Page title: 34px large title style
- Store selector: iOS segmented control (was pill buttons)
- Recipe list: grouped inset list with 0.5px separators
- Day badges: `#B4A0ED` background
- Suggestion cards: white bg, 12px radius on `#F2F2F7` background
- Primary CTA: lavender button

### GroceryList.tsx
- Large title style
- Progress bar: lavender fill
- Category headers: `#EFEFF4` background strips
- Check circles instead of square checkboxes
- Source badges with updated colors

### ShoppingMode.tsx
- Progress bar: lavender fill
- Check circles (same as GroceryList)
- Bottom bar: frosted glass style matching tab bar
- Category headers: uppercase, small, gray

### Recipes.tsx
- Large title
- Search input: system styling
- Recipe grid: unchanged layout, cards already have rounded corners

### RecipeDetail.tsx
- Large title
- Ingredients: grouped inset list rows
- Step numbers: lavender circles (was `bg-green-100 text-green-700`)
- Buttons: lavender primary, red destructive outline

### RecipeCard.tsx
- Keep card layout
- Tag pills: lavender tint background (`#F3EFFC`, `#B4A0ED` text)

### Staples.tsx
- Check circles (matching grocery list)
- Category badges: lighter styling
- Add form: grouped list style

### Settings.tsx
- Sections: grouped inset lists (already close, refine borders/radius)
- Store selector: segmented control
- Member avatars: lavender tint (was `bg-green-100 text-green-700`)
- Sortable items: refined to match iOS list style
- Logout: red outline button

### Login.tsx
- Centered card on `#F2F2F7` background
- Primary passkey button: lavender
- Inputs: iOS-style with lighter borders
- Mode switcher links: system styling

### ScrapeDialog.tsx
- Bottom sheet: white, 16px top radius
- Overlay: `rgba(0,0,0,0.4)` (unchanged)
- Buttons: lavender primary, gray outline cancel

### CategoryGroup.tsx
- Header: `#EFEFF4` background strip
- Chevron animation: unchanged

### GroceryItemRow.tsx
- Square checkbox → round check circle
- Source badges with updated colors

### DiscountBadge.tsx
- Background: `#B4A0ED` (was `bg-green-600`)

## Implementation Approach

Install `lucide-react` for outline icons. Define color tokens as CSS custom properties in `index.css` and reference them via Tailwind's `var()` support. Update each component's Tailwind classes to use the new design system. No structural or behavioral changes.

## Out of Scope

- Dark mode
- New components or pages
- Functionality changes
- Animations beyond existing transitions
- Server-side changes
