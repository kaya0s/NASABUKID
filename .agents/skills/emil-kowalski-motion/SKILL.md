---
name: emil-kowalski-motion
description: Apply Emil Kowalski's core principles for UI motion and animation (Animations on the Web). Use when creating, refining, or debugging web animations, micro-interactions, layout transitions, spring physics, and CSS/Framer Motion easing to make UI motion feel tactile, fast, purposeful, and right.
---

# Emil Kowalski Design & Motion: Make UI Motion Feel Right

This skill encapsulates the motion design principles and engineering practices taught by Emil Kowalski (*Animations on the Web*). It guides you to build UI motion that feels snappy, natural, and grounded in real-world physics rather than decorative or sluggish.

---

## 1. Core Philosophy of UI Motion

1. **Motion is Functional, Not Decorative:**
   - Every animation must answer one of three questions for the user:
     - *Where did this element come from?*
     - *Where is it going?*
     - *What changed in the system?*
   - If an animation does not improve spatial continuity or provide tactile feedback, remove it.

2. **Snappy & Immediate Over Slow & Dramatic:**
   - Great UI motion is felt, not watched.
   - If a user has to wait for an animation to finish before they can interact, the animation is too slow.

3. **Asymmetric Timing (Entrances vs. Exits):**
   - **Entrances** can take slightly longer (~200ms–350ms) with gentle deceleration because the user's focus is arriving at new content.
   - **Exits** must be fast and dismissive (~120ms–200ms), getting out of the user's way immediately.

---

## 2. Durations and Timing Rules

| UI Context | Target Duration | Easing / Curve |
| :--- | :--- | :--- |
| **Micro-interactions** (button press, checkbox toggle, icon switch) | `100ms – 180ms` | Snappy ease-out or rigid spring |
| **Small overlays** (tooltips, small dropdowns, menus) | `150ms – 240ms` | Deceleration curve / low-mass spring |
| **Large layout shifts** (modals, sheets, page transitions, accordion collapse) | `250ms – 400ms` | Critically damped spring or custom bezier |
| **Exits / Dismissals** | `120ms – 200ms` | Accelerating ease-in or snappy spring |

> **Rule of Thumb:** If an animation feels slightly too slow in development, cut its duration by 20–30%.

---

## 3. Easing & Curves

### Never Use Linear Easing for Spatial UI Movement
`linear` motion does not exist in nature and feels mechanical and robotic.

### Recommended CSS Cubic Beziers
- **Snappy Out (Default for entrances & reveals):**
  `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo equivalent: fast initial burst, smooth glide into resting state).
- **Smooth Deceleration:**
  `cubic-bezier(0.25, 1, 0.5, 1)` (great for cards, hover lifts, and list items).
- **Fast Exit:**
  `cubic-bezier(0.4, 0, 1, 1)` or `cubic-bezier(0.7, 0, 0.84, 0)` (pulls off-screen quickly).

### Spring Physics (Framer Motion / CSS Springs)
When using spring physics, avoid underdamped springs that wobble like jelly unless specifically designing a playful game element.
- **Natural, clean UI spring:**
  - `stiffness: 400`
  - `damping: 30` (critically damped: fast snap with zero or negligible overshoot)
  - `mass: 0.8`

---

## 4. Spatial Continuity and Origins

1. **Keep Distances Short:**
   - Elements shouldn't fly in from the far corners of the screen.
   - A modal or dropdown should offset by **8px to 16px** (`translateY(8px)` or `translateY(12px)`) while fading in, rather than 100px.
2. **Scale Nuance:**
   - Modals and popovers should scale from `0.95` or `0.97` to `1.0`. Starting from `0.0` or `0.5` looks exaggerated and cheap.
3. **Animate from the Source of Action:**
   - Dropdowns should scale from `transform-origin: top left` or `top center` relative to the button that triggered them.
   - Expanding cards should use layout animations (FLIP technique / `layoutId`) to transition smoothly from the collapsed bounding box.

---

## 5. Choreography & Staggering

1. **Tight Stagger Delays:**
   - When revealing a list of cards or menu items, stagger delays should be **20ms to 40ms** per item.
   - Never use 100ms+ stagger delays—by item 5 the user will feel the app lagging.
2. **Cap Total Choreography Time:**
   - The entire group animation should complete within **400ms** total, regardless of how many items are present.
   - Limit animated items to the first 4–6 visible items.

---

## 6. Performance & Composite Properties

1. **Animate Only GPU-Accelerated Properties:**
   - Stick strictly to `transform` (`translate`, `scale`, `rotate`) and `opacity`.
   - **Never** animate `height`, `width`, `top`, `left`, `margin`, or `padding` directly. Doing so triggers browser layout reflows and drops frames on mobile devices.
2. **Smooth Height Accordions:**
   - For expanding accordions or drawers, use CSS Grid transition:
     ```css
     .accordion-content {
       display: grid;
       grid-template-rows: 0fr;
       transition: grid-template-rows 250ms cubic-bezier(0.16, 1, 0.3, 1);
     }
     .accordion-content[data-open="true"] {
       grid-template-rows: 1fr;
     }
     .accordion-inner {
       overflow: hidden;
     }
     ```

---

## 7. Tactile Micro-Interactions

- **Active / Press States:**
  Add a subtle scale-down on `:active`:
  ```css
  .button:active {
    transform: scale(0.97);
    transition: transform 100ms ease;
  }
  ```
- **Hover Lifts:**
  Combine a small lift with a soft shadow elevation:
  ```css
  .card {
    transition: transform 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms ease;
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
  ```

---

## 8. Accessibility: Respecting Reduced Motion

Always provide fallback styles for users with vestibular disorders:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Or selectively cross-fade without spatial movement when reduced motion is requested.
