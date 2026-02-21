# Accessibility and UX Decisions

> **Confidence:** INFERRED | Some accessibility features may need verification

---

## Accessibility Features

### Focus States

**File:** `src/app/globals.css`

```css
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```

All interactive elements show a visible focus ring when navigated via keyboard.

### Semantic HTML

Components use appropriate semantic elements:

```tsx
// Navigation
<nav className={styles.nav}>...</nav>

// Headers
<header className={styles.topbar}>...</header>

// Main content
<main className={styles.canvas}>...</main>

// Aside panels
<aside className={styles.inspector}>...</aside>
```

### Button Accessibility

```tsx
<button
    className={styles.menuButton}
    onClick={toggleSidebar}
    aria-label="Toggle menu"  // Screen reader label
>
    <MenuIcon />
</button>

<button
    aria-label="Toggle inspector"
    title={isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
>
    <PanelIcon />
</button>
```

### Form Labels

```tsx
<Input
  label="YouTube URL" // Generates <label> with for attribute
  id={inputId} // Links label to input
/>
```

Internal implementation:

```tsx
const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;

{label && (
    <label htmlFor={inputId} className={styles.label}>
        {label}
    </label>
)}
<input ref={ref} id={inputId} ... />
```

---

## Dark Mode

The application uses a dark theme by default:

```tsx
// src/app/layout.tsx
<html lang="en" className="dark">
```

```css
/* Color scheme declaration */
html {
  color-scheme: dark;
}

body {
  background: var(--bg-primary); /* #0a0a0b */
  color: var(--text-primary); /* #ffffff */
}
```

**Rationale:** Video editing tools typically use dark themes to reduce eye strain and make content preview more accurate.

---

## Text Rendering

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

**Effect:** Smoother, more readable text across browsers.

---

## Reduced Motion

**Status:** NOT IMPLEMENTED

Currently, animations do not respect `prefers-reduced-motion`. Recommended addition:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## UX Decisions

### Loading Feedback

| Action            | Feedback                   |
| ----------------- | -------------------------- |
| Initial page load | Skeleton screens           |
| Button submission | Spinner + disabled state   |
| Job fetch         | Centered spinner with text |
| Auth check        | Full-screen spinner        |

### Error Communication

| Error Type      | Display                     |
| --------------- | --------------------------- |
| Form validation | Inline below field          |
| API error       | Alert/toast + error message |
| 403/404         | Full page with back button  |
| Session expiry  | Alert + redirect            |

### Progress Visualization

**Pipeline Timeline:**

- Visual steps with checkmarks for completed
- Current step highlighted
- Failed step shows X with error message

**Progress Bar:**

- Only shown during active processing
- Width based on `clips_ready / clip_count`

### Navigation Patterns

**Sidebar Active State:**

- Current page highlighted with accent color
- Animated indicator using `layoutId`

**Breadcrumb-style Back:**

- Job detail page has "← Back" button
- Returns to jobs list

### Confirmation Patterns

| Action     | Confirmation                 |
| ---------- | ---------------------------- |
| Logout     | Immediate (no confirmation)  |
| Create job | Form validation, then submit |
| Delete job | NOT IMPLEMENTED              |

---

## Mobile Responsiveness

### Sidebar Behavior

```tsx
// Mobile: sidebar hidden by default, overlay when open
{
  isSidebarOpen && (
    <motion.div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
  );
}

// Toggle via hamburger menu in TopBar
<button className={styles.menuButton} onClick={toggleSidebar}>
  <MenuIcon />
</button>;
```

### CSS Variables for Layout

```css
:root {
  --sidebar-width: 260px;
  --inspector-width: 340px;
  --topbar-height: 60px;
}
```

These can be adjusted via media queries for responsive layouts.

---

## Color Contrast

| Usage          | Foreground | Background | Ratio (approx) |
| -------------- | ---------- | ---------- | -------------- |
| Primary text   | #ffffff    | #0a0a0b    | 21:1 ⬛        |
| Secondary text | #a1a1a6    | #0a0a0b    | 7:1 ✅         |
| Muted text     | #6e6e73    | #0a0a0b    | 4:1 ⚠️         |
| Accent on dark | #6366f1    | #0a0a0b    | 4.5:1 ✅       |

**Note:** Muted text may not meet WCAG AA for small text. Consider for future improvement.
