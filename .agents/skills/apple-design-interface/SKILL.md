---
name: apple-design-interface
description: Apply Apple Human Interface Guidelines (HIG) and design philosophy to make interfaces feel effortless, intuitive, tactile, and visually unified. Use when designing UI layouts, typography hierarchy, fluid tactile controls, blur materials, spacing, and system feedback.
---

# Apple Design: Make Interfaces Feel Effortless

This skill encapsulates Apple's Human Interface Guidelines (HIG) and design philosophy. It guides you to create interfaces that feel clean, tactile, fluid, and effortless to use—especially on mobile and responsive web applications.

---

## 1. Core Principles: Clarity, Deference, and Depth

1. **Clarity:**
   - Text must be legible at every size.
   - Icons are precise and recognizable.
   - Adornments are subtle and purposeful.
   - Contrast is uncompromising (never sacrifice legibility for aesthetics).

2. **Deference:**
   - The user interface yields to the content.
   - Fluid motion and crisp visual design help people interact with content without competing with it.
   - Chrome, borders, and controls should feel lightweight and unobtrusive.

3. **Depth:**
   - Distinct visual layers and realistic shadows convey spatial hierarchy.
   - Translucent materials (`backdrop-filter: blur(...)`) help users understand context by showing what lies beneath while keeping the active layer in focus.

---

## 2. Layout, Grid, and Spacing

1. **8pt Grid & Consistent Rhythm:**
   - Use spacing multiples of 4px and 8px (e.g., `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`).
   - Group related elements closely (e.g., `4px–8px` between a label and input), and separate distinct sections generously (`20px–32px`).

2. **Rounded Corners & Squircles:**
   - Apple interfaces favor continuous curvature (squircles) over sharp corners.
   - For web interfaces:
     - Outer cards: `border-radius: 14px – 20px;`
     - Modals / Sheets: `border-radius: 20px – 28px;`
     - Chips / Pills: `border-radius: 9999px;` or `border-radius: 8px;`
     - Nested corners formula: `inner_radius = outer_radius - padding`. (Ensures nested borders curve harmoniously without awkward gaps).

3. **Mobile Thumb-Zone Optimization:**
   - Place primary actions, tabs, and navigation controls in the lower half of the screen where thumbs reach naturally.
   - Minimum tap target size is **44pt × 44pt** (minimum 40px–48px hit area) for all buttons and interactive controls.

---

## 3. Materials, Translucency, and Surfaces

1. **Frosted Glass & Vibrancy:**
   - Use translucent backgrounds with backdrop blur for navigation bars, floating headers, and bottom sheets:
     ```css
     background: rgba(255, 255, 255, 0.78);
     backdrop-filter: blur(20px) saturate(180%);
     -webkit-backdrop-filter: blur(20px) saturate(180%);
     ```
   - For dark mode:
     ```css
     background: rgba(28, 28, 30, 0.75);
     backdrop-filter: blur(20px) saturate(180%);
     -webkit-backdrop-filter: blur(20px) saturate(180%);
     ```

2. **Subtle Hairline Borders:**
   - Avoid heavy or dark borders. Instead, use ultra-thin hairline borders with low opacity to delineate floating glass surfaces:
     ```css
     border: 1px solid rgba(0, 0, 0, 0.08); /* light mode */
     border: 1px solid rgba(255, 255, 255, 0.12); /* dark mode */
     ```

3. **Layered Elevation:**
   - **Base canvas:** Neutral background (`#F5F5F7` in light mode).
   - **Elevated cards:** Pure card surface (`#FFFFFF`) with soft ambient occlusion shadow:
     ```css
     box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.04);
     ```
   - **Floating elements (sheets, popovers):**
     ```css
     box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12);
     ```

---

## 4. Typography & Visual Hierarchy

1. **Font System:**
   - Prefer native system typography stacks for instant rendering and natural OS feel:
     ```css
     font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif;
     ```
2. **Clear Weight Contrast:**
   - Pair bold display titles (`font-weight: 700`) with clean, medium weight section subheaders (`font-weight: 600`), regular body (`font-weight: 400` or `450`), and muted secondary captions.
   - Avoid excessive font sizes; use generous whitespace and weight differences to create structure instead of oversized text.

3. **Color Contrast & Dynamic Text:**
   - Primary text: High contrast (`rgba(0, 0, 0, 0.9)` or `#1D1D1F`).
   - Secondary text: Subdued but legible (`rgba(0, 0, 0, 0.55)` or `#86868B`). Minimum contrast ratio must meet WCAG AA (4.5:1).

---

## 5. Direct Manipulation & Tactile Controls

1. **Immediate Touch Feedback:**
   - Tapping an interactive element must immediately acknowledge the gesture:
     ```css
     .interactive:active {
       transform: scale(0.97);
       opacity: 0.88;
       transition: transform 0.1s ease, opacity 0.1s ease;
     }
     ```
2. **Segmented Controls & Pill Sliders:**
   - Group related mutually-exclusive choices into compact segmented controls.
   - Active pill should feature a crisp background, subtle shadow, and smooth slide transition between options.

3. **Progressive Disclosure:**
   - Do not present every control or data point at once.
   - Show the summary and primary action first. Provide clear, tap-friendly drill-downs for secondary options.

---

## 6. Feedback & Edge Cases

1. **Confirmation Over Disruption:**
   - Favor inline status badges, gentle checkmarks, or subtle toasts over disruptive full-screen modal alerts for routine confirmations.
2. **Empty States with Clear Guidance:**
   - Empty states should explain what belongs in the space and feature a single prominent call to action.
