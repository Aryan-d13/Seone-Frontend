// ============================================
// ANIMATION PRESETS
// Framer Motion animation configurations
// ============================================

import { Variants, Transition } from 'framer-motion';

// ---------- Transitions ----------
export const transitions = {
    fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } as Transition,
    base: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } as Transition,
    slow: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } as Transition,
    spring: { type: 'spring', stiffness: 400, damping: 30 } as Transition,
    springBouncy: { type: 'spring', stiffness: 300, damping: 20 } as Transition,
};

// ---------- Page Transitions ----------
export const pageVariants: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};

export const pageTransition: Transition = {
    duration: 0.3,
    ease: [0.4, 0, 0.2, 1],
};

// ---------- Fade Variants ----------
export const fadeVariants: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

// ---------- Slide Variants ----------
export const slideUpVariants: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
};

export const slideDownVariants: Variants = {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
};

export const slideLeftVariants: Variants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
};

export const slideRightVariants: Variants = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
};

// ---------- Scale Variants ----------
export const scaleVariants: Variants = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
};

export const popVariants: Variants = {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
};

// ---------- Stagger Container ----------
export const staggerContainer: Variants = {
    initial: {},
    animate: {
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1,
        },
    },
};

export const staggerContainerFast: Variants = {
    initial: {},
    animate: {
        transition: {
            staggerChildren: 0.03,
            delayChildren: 0.05,
        },
    },
};

// ---------- List Item Variants ----------
export const listItemVariants: Variants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
};

// ---------- Modal Variants ----------
export const modalOverlayVariants: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

export const modalContentVariants: Variants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
};

// ---------- Sidebar Variants ----------
export const sidebarVariants: Variants = {
    initial: { x: -280, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -280, opacity: 0 },
};

// ---------- Inspector Variants ----------
export const inspectorVariants: Variants = {
    initial: { x: 340, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 340, opacity: 0 },
};

// ---------- Button Hover/Tap ----------
// ---------- Button Hover/Tap ----------
export const buttonTap = { scale: 0.97 };
export const buttonHover = { y: -1, filter: 'brightness(1.1)' };

// ---------- Skeleton Shimmer ----------
export const shimmerVariants: Variants = {
    initial: { backgroundPosition: '-200% 0' },
    animate: {
        backgroundPosition: '200% 0',
        transition: {
            repeat: Infinity,
            duration: 1.5,
            ease: 'linear',
        },
    },
};

// ---------- Progress Bar ----------
export const progressVariants: Variants = {
    initial: { width: 0 },
    animate: (progress: number) => ({
        width: `${progress}%`,
        transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
    }),
};
