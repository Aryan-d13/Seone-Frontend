# UI Components and Design System

> **Confidence:** CONFIRMED | **Source:** Direct code analysis of components/ui, globals.css

---

## Design System Overview

Seone uses a **custom CSS design system** with:
- CSS Custom Properties (variables) for theming
- CSS Modules for component scoping
- Framer Motion for animations
- No Tailwind or CSS-in-JS

**File:** `src/app/globals.css`

---

## Design Tokens

### Colors

```css
:root {
  /* Background Colors - Deep Dark Palette */
  --bg-primary: #0a0a0b;
  --bg-secondary: #111113;
  --bg-tertiary: #1a1a1d;
  --bg-elevated: #222225;
  --bg-hover: #2a2a2e;
  
  /* Text Colors - Crisp Hierarchy */
  --text-primary: #ffffff;
  --text-secondary: #a1a1a6;
  --text-muted: #6e6e73;
  --text-disabled: #48484a;
  
  /* Accent Colors - Vibrant Indigo */
  --accent-primary: #6366f1;
  --accent-primary-hover: #818cf8;
  --accent-primary-muted: rgba(99, 102, 241, 0.15);
  
  /* Semantic Colors */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
}
```

### Spacing

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Border Radius

```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 9999px;
}
```

### Typography

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */
}
```

### Transitions

```css
:root {
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Layout

```css
:root {
  --sidebar-width: 260px;
  --inspector-width: 340px;
  --topbar-height: 60px;
}
```

---

## Base Components

### Button

**File:** `src/components/ui/Button.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant |
| `isLoading` | `boolean` | `false` | Shows spinner, disables button |
| `leftIcon` | `ReactNode` | — | Icon before text |
| `rightIcon` | `ReactNode` | — | Icon after text |
| `disabled` | `boolean` | `false` | Disabled state |

#### Usage

```tsx
// Primary button
<Button onClick={handleSubmit}>Submit</Button>

// Secondary with loading
<Button variant="secondary" isLoading={isSubmitting}>
    Processing...
</Button>

// Ghost button (minimal style)
<Button variant="ghost" size="sm">Cancel</Button>

// With icon
<Button leftIcon={<PlusIcon />}>New Job</Button>
```

#### Animation

Uses Framer Motion for hover/tap effects:
```tsx
whileHover={{ y: -1, filter: 'brightness(1.1)' }}
whileTap={{ scale: 0.97 }}
```

---

### Input

**File:** `src/components/ui/Input.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Label text above input |
| `error` | `string` | — | Error message below input |
| `hint` | `string` | — | Hint text (shown if no error) |
| `leftIcon` | `ReactNode` | — | Icon inside input, left side |
| `rightElement` | `ReactNode` | — | Element inside input, right side |

#### Usage

```tsx
<Input
    label="YouTube URL"
    placeholder="https://youtube.com/watch?v=..."
    value={url}
    onChange={(e) => setUrl(e.target.value)}
    error={errors.url}
    leftIcon={<YoutubeIcon />}
/>
```

---

### DualRangeSlider

**File:** `src/components/ui/DualRangeSlider.tsx`

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `min` | `number` | — | Minimum value |
| `max` | `number` | — | Maximum value |
| `minValue` | `number` | — | Current min selection |
| `maxValue` | `number` | — | Current max selection |
| `step` | `number` | `1` | Step increment |
| `label` | `string` | — | Label text |
| `formatValue` | `(value: number) => string` | — | Display formatter |
| `onChange` | `(min, max) => void` | — | Change handler |

#### Usage

```tsx
<DualRangeSlider
    label="Clip Duration Range"
    min={30}
    max={600}
    minValue={formData.minDuration}
    maxValue={formData.maxDuration}
    step={15}
    formatValue={formatDuration}  // "1:00" format
    onChange={(min, max) => {
        updateField('minDuration', min);
        updateField('maxDuration', max);
    }}
/>
```

---

## Animation Library

**File:** `src/lib/animations.ts`

### Transition Presets

```typescript
export const transitions = {
    fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
    base: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
    slow: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
    spring: { type: 'spring', stiffness: 400, damping: 30 },
};
```

### Page Transitions

```typescript
export const pageVariants: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};
```

### List Animations

```typescript
export const staggerContainer: Variants = {
    initial: {},
    animate: {
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1,
        },
    },
};

export const listItemVariants: Variants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
};
```

### Usage in Components

```tsx
<motion.div
    className={styles.grid}
    variants={staggerContainer}
    initial="initial"
    animate="animate"
>
    {items.map((item) => (
        <motion.div key={item.id} variants={listItemVariants}>
            {item.content}
        </motion.div>
    ))}
</motion.div>
```

---

## Utility Classes

### Global CSS Classes

```css
/* Text Colors */
.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-muted { color: var(--text-muted); }
.text-accent { color: var(--accent-primary); }

/* Backgrounds */
.bg-primary { background: var(--bg-primary); }
.bg-secondary { background: var(--bg-secondary); }

/* Glass Effect */
.glass {
    background: var(--glass-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
}

/* Gradient Text */
.gradient-text {
    background: linear-gradient(135deg, var(--accent-primary) 0%, #a855f7 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* Animations */
.animate-fadeIn { animation: fadeIn var(--transition-base) ease-out; }
.animate-spin { animation: spin 1s linear infinite; }
```

### cn() Helper

**File:** `src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
    return clsx(inputs);
}
```

**Usage:**
```tsx
<div className={cn(styles.card, isActive && styles.active, className)}>
```

---

## Component Patterns

### CSS Module Structure

Each component has a paired `.module.css` file:
```
Button.tsx
Button.module.css
```

```tsx
import styles from './Button.module.css';

<button className={styles.button}>Click</button>
```

### Conditional Classes

```tsx
<div className={cn(
    styles.step,
    isActive && styles.active,
    isDone && styles.done,
    isError && styles.error
)}>
```

### Dynamic Styles

```tsx
<div
    className={styles.range}
    style={{
        left: `${minPercent}%`,
        width: `${maxPercent - minPercent}%`
    }}
/>
```
