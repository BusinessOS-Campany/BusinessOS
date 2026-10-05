# Business OS — Design System

> Single source of truth for all visual decisions across the platform.

---

## 1. Design Principles

1. **Quietly powerful** — strong typography, excellent spacing, subtle color
2. **Purposeful motion** — 150-250ms, easing, `prefers-reduced-motion` respected
3. **High information density** — no wasted space, no decorative cards
4. **Consistent surfaces** — CSS variables everywhere, zero hardcoded colors in components
5. **Accessible first** — keyboard navigation, focus rings, screen readers, 44px touch targets

---

## 2. Color System

### 2.1 Semantic Tokens

Every color in the UI maps to a semantic token. Components never use raw hex values.

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--background` | `#ffffff` | `#09090b` | Page background |
| `--foreground` | `#09090b` | `#fafafa` | Primary text |
| `--card` | `#ffffff` | `#09090b` | Card/sheet surface |
| `--card-foreground` | `#09090b` | `#fafafa` | Card text |
| `--popover` | `#ffffff` | `#09090b` | Popover/dropdown surface |
| `--popover-foreground` | `#09090b` | `#fafafa` | Popover text |
| `--primary` | `#059669` | `#10b981` | Primary actions |
| `--primary-foreground` | `#ffffff` | `#ffffff` | Text on primary |
| `--secondary` | `#f4f4f5` | `#18181b` | Secondary surface |
| `--secondary-foreground` | `#18181b` | `#fafafa` | Secondary text |
| `--muted` | `#f4f4f5` | `#18181b` | Muted surface |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | Subtle text |
| `--accent` | `#f4f4f5` | `#18181b` | Accent surface |
| `--accent-foreground` | `#18181b` | `#fafafa` | Accent text |
| `--destructive` | `#ef4444` | `#f87171` | Destructive actions |
| `--destructive-foreground` | `#ffffff` | `#ffffff` | Text on destructive |
| `--border` | `#e4e4e7` | `#27272a` | Borders |
| `--input` | `#e4e4e7` | `#27272a` | Input borders |
| `--ring` | `#059669` | `#10b981` | Focus rings |

### 2.2 Status Colors

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--success` | `#16a34a` | `#4ade80` | Success states |
| `--success-foreground` | `#ffffff` | `#052e16` | Text on success |
| `--warning` | `#d97706` | `#fbbf24` | Warning states |
| `--warning-foreground` | `#ffffff` | `#451a03` | Text on warning |
| `--info` | `#059669` | `#34d399` | Info states |
| `--info-foreground` | `#ffffff` | `#052e16` | Text on info |

### 2.3 Surface Layers

A layered surface system creates visual depth without relying on shadows alone.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--surface-0` | `#ffffff` | `#09090b` | Page background |
| `--surface-1` | `#f4f4f5` | `#18181b` | Sidebar, cards |
| `--surface-2` | `#e4e4e7` | `#27272a` | Elevated cards, dropdowns |
| `--surface-3` | `#d4d4d8` | `#3f3f46` | Highest elevation |

### 2.4 Sidebar Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--sidebar` | `#f4f4f5` | `#09090b` |
| `--sidebar-foreground` | `#18181b` | `#fafafa` |
| `--sidebar-accent` | `#e4e4e7` | `#18181b` |
| `--sidebar-border` | `#e4e4e7` | `#27272a` |
| `--sidebar-primary` | `#059669` | `#10b981` |
| `--sidebar-primary-foreground` | `#ffffff` | `#ffffff` |
| `--sidebar-ring` | `#059669` | `#10b981` |

### 2.5 Header Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--header-bg` | `#ffffff` | `#09090b` |
| `--header-border` | `#e4e4e7` | `#27272a` |
| `--header-foreground` | `#09090b` | `#fafafa` |

### 2.6 Table Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--table-header` | `#f4f4f5` | `#18181b` |
| `--table-row-hover` | `#f4f4f5` | `#18181b` |

### 2.7 Skeleton Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--skeleton-from` | `#e4e4e7` | `#27272a` |
| `--skeleton-to` | `#f4f4f5` | `#18181b` |

---

## 3. Typography

### 3.1 Font Stack

```css
--font-sans: "Geist", "Inter", system-ui, -apple-system, sans-serif;
--font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
```

### 3.2 Type Scale

| Name | Size | Line Height | Weight | Use |
|------|------|-------------|--------|-----|
| `display` | 3.5rem (56px) | 1.1 | 800 | Hero headlines |
| `h1` | 2.25rem (36px) | 1.2 | 700 | Page titles |
| `h2` | 1.875rem (30px) | 1.3 | 700 | Section titles |
| `h3` | 1.5rem (24px) | 1.3 | 600 | Card titles |
| `h4` | 1.25rem (20px) | 1.4 | 600 | Subsection titles |
| `body` | 1rem (16px) | 1.5 | 400 | Body text |
| `body-sm` | 0.875rem (14px) | 1.5 | 400 | Secondary text |
| `caption` | 0.75rem (12px) | 1.5 | 400 | Labels, captions |
| `overline` | 0.75rem (12px) | 1.5 | 600 | Overline labels |

---

## 4. Spacing Scale

Based on a 4px grid:

| Token | Value | Use |
|-------|-------|-----|
| `--space-0` | 0px | — |
| `--space-1` | 4px | Tight internal padding |
| `--space-2` | 8px | Default internal padding |
| `--space-3` | 12px | Card internal padding |
| `--space-4` | 16px | Standard gaps |
| `--space-5` | 20px | Section gaps |
| `--space-6` | 24px | Page padding (mobile) |
| `--space-8` | 32px | Page padding (desktop) |
| `--space-10` | 40px | Large section gaps |
| `--space-12` | 48px | Section padding |
| `--space-16` | 64px | Hero section padding |

---

## 5. Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 4px | Badges, small elements |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 8px | Cards, dialogs |
| `--radius-xl` | 12px | Large cards, modals |
| `--radius-2xl` | 16px | Feature cards |
| `--radius-full` | 9999px | Pills, avatars |

---

## 6. Shadows

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle elevation |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)` | `0 1px 3px rgba(0,0,0,0.4)` | Default card shadow |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)` | `0 4px 6px rgba(0,0,0,0.4)` | Elevated elements |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)` | `0 10px 15px rgba(0,0,0,0.5)` | Dropdowns, popovers |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.04)` | `0 20px 25px rgba(0,0,0,0.6)` | Modals |

---

## 7. Motion System

### 7.1 Durations

| Token | Value | Use |
|-------|-------|-----|
| `--duration-fast` | 100ms | Tooltip show/hide |
| `--duration-normal` | 150ms | Button hover, focus ring |
| `--duration-slow` | 250ms | Panel transitions |
| `--duration-slower` | 350ms | Modal enter/exit |

### 7.2 Easing Curves

| Token | Value | Use |
|-------|-------|-----|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Enter animations |
| `--ease-in-out` | `cubic-bezier(0.76, 0, 0.24, 1)` | Layout transitions |

### 7.3 Transition Utilities

```css
transition: all var(--duration-normal) var(--ease-out);
```

### 7.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Focus System

One consistent focus ring pattern across all components:

```css
/* Default */
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* On dark surfaces (sidebar, cards) */
.dark :focus-visible {
  outline-color: var(--ring);
}
```

All interactive elements must have:
- Visible focus indicator for keyboard users
- 44×44px minimum touch target on mobile
- `cursor: pointer` on clickable elements

---

## 9. Component Standards

### 9.1 Button

| Variant | Light | Dark |
|---------|-------|------|
| `default` | `bg-primary text-primary-foreground` | Same |
| `destructive` | `bg-destructive text-destructive-foreground` | Same |
| `outline` | `border bg-transparent text-foreground` | Same |
| `secondary` | `bg-secondary text-secondary-foreground` | Same |
| `ghost` | `bg-transparent text-foreground hover:bg-accent` | Same |
| `link` | `text-primary underline-offset-4 hover:underline` | Same |

Sizes: `sm` (32px), `default` (36px), `lg` (40px), `icon` (36×36px)

### 9.2 Card

```
bg-card text-card-foreground border border-border rounded-xl shadow-sm
```

### 9.3 Input / Select / Textarea

```
bg-background text-foreground border border-input rounded-md
focus:ring-2 focus:ring-ring focus:ring-offset-2
placeholder:text-muted-foreground
```

### 9.4 Table

```
TableHeader: bg-muted text-muted-foreground
TableRow: border-b border-border hover:bg-muted/50
TableHead: text-muted-foreground font-medium
```

### 9.5 Dialog / Dropdown / Select Content

```
bg-popover text-popover-foreground border border-border shadow-lg rounded-lg
```

### 9.6 Tooltip

```
bg-popover text-popover-foreground border border-border rounded-md shadow-md
text-xs px-3 py-1.5
```

### 9.7 Badge

| Variant | Light | Dark |
|---------|-------|------|
| `default` | `bg-primary text-primary-foreground` | Same |
| `secondary` | `bg-secondary text-secondary-foreground` | Same |
| `destructive` | `bg-destructive text-destructive-foreground` | Same |
| `outline` | `border text-foreground` | Same |
| `success` | `bg-success/10 text-success` | Same |
| `warning` | `bg-warning/10 text-warning` | Same |

### 9.8 Avatar

```
AvatarFallback: bg-muted text-muted-foreground
```

### 9.9 Progress

```
Track: bg-secondary
Indicator: bg-primary
```

### 9.10 ScrollArea

```
Thumb: bg-border rounded-full
Track: bg-transparent
```

### 9.11 Separator

```
bg-border
```

### 9.12 Label

```
text-sm font-medium text-foreground
```

### 9.13 Tabs

```
TabsList: bg-muted text-muted-foreground rounded-lg p-1
TabsTrigger: rounded-md text-sm font-medium
  active: bg-background text-foreground shadow-sm
```

### 9.14 Checkbox / Switch

```
Border: border-border
Focus ring: ring-2 ring-ring ring-offset-2
Checked: bg-primary border-primary
Unchecked bg: bg-background
```

---

## 10. RTL Support

All components must work correctly in both LTR and RTL:

1. Use logical properties: `ms-*` instead of `ml-*`, `me-*` instead of `mr-*`
2. Use `start`/`end` for flex alignment when appropriate
3. Use `inset-inline-start`/`inset-inline-end` for positioning
4. Test both `dir="rtl"` and `dir="ltr"`

---

## 11. Responsive Breakpoints

| Name | Min Width | Layout |
|------|-----------|--------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets — sidebar appears |
| `lg` | 1024px | Small desktops |
| `xl` | 1280px | Large desktops |
| `2xl` | 1536px | Ultra-wide |

### Layout Rules

- **Mobile (<768px):** No sidebar, BottomNav, full-width content
- **Tablet (768-1024px):** Collapsed sidebar (icons only), 64px offset
- **Desktop (>1024px):** Expanded sidebar (256px), full content

---

## 12. Z-Index Scale

| Layer | Value | Use |
|-------|-------|-----|
| Below | -1 | Decorative backgrounds |
| Base | 0 | Default stacking |
| Dropdown | 50 | Dropdowns, selects |
| Sticky | 60 | Sticky headers |
| Sidebar | 70 | Mobile sidebar overlay |
| Modal | 80 | Dialogs, modals |
| Toast | 90 | Toast notifications |
| Tooltip | 100 | Tooltips |

---

*This document is the source of truth. When in doubt, refer here.*
