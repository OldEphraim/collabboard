# CollabBoard Accessibility Features

CollabBoard is built with accessibility as a core feature, not an afterthought. The developer is colorblind, so these features address real usability needs.

## Colorblind-Safe Palette

All default colors have been replaced with a palette distinguishable under protanopia, deuteranopia, and tritanopia (the three most common types of color vision deficiency).

**Design principles:**
- Blue/orange is the primary contrast pair (based on IBM Design and Wong colorblind-safe palettes)
- Red and green are never used as the sole distinguishing colors
- All color pickers show **text labels** alongside swatches — colors are never communicated through color alone

**Sticky note colors:** Yellow, Blue, Orange, Purple, Magenta, Teal
**Shape colors:** Blue, Orange, Purple, Magenta, Teal, Gray
**Cursor/presence colors:** Blue, Orange, Purple, Teal, Magenta, Yellow, Sky blue, Fuchsia

The centralized palette lives in `lib/colors.ts`.

## High-Contrast Mode

Toggle via the **HC Off / HC On** button in the board header (between the info icon and the presence bar).

**What changes when enabled:**
- Canvas background switches from light gray (#F9FAFB) to pure white (#FFFFFF)
- Sticky notes get black borders (2px normal, 3px when selected) and black text
- Shapes and circles get thicker strokes (minimum 3px)
- Frames get solid borders (dashed lines removed) at 2px width
- Connectors use black strokes at 3px width
- Toolbar, selection actions bar, and AI chat panel get extra-thick dark borders

**Persistence:** The preference is saved to `localStorage` and restored on page load.

**WCAG compliance:** High-contrast mode meets WCAG AA contrast requirements (4.5:1 for normal text, 3:1 for large text).

## Keyboard Navigation

The canvas is fully navigable without a mouse.

### Object Navigation

| Shortcut | Action |
|----------|--------|
| `Tab` | Cycle forward through board objects (in z-index order, skips connectors) |
| `Shift+Tab` | Cycle backward through board objects |
| `Arrow keys` | Move selected object(s) by 5px |
| `Shift+Arrow keys` | Move selected object(s) by 20px |
| `Enter` | Start editing text on the focused object (sticky notes and text elements) |
| `Escape` | Deselect all objects and clear focus |
| `Delete` / `Backspace` | Delete selected object(s) |

### Selection & Clipboard

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+A` | Select all objects (excluding connectors) |
| `Shift+Click` | Add/remove object from multi-selection |
| `Shift+Drag` | Drag-to-select rectangle |
| `Ctrl/Cmd+C` | Copy selected objects to clipboard |
| `Ctrl/Cmd+V` | Paste objects from clipboard |
| `Ctrl/Cmd+D` | Duplicate selected objects |

### Focus Ring

When navigating with Tab, the currently focused object displays a **dashed blue rectangle** around it on the canvas. This ring is purely visual — it doesn't interfere with clicks or drags (`listening={false}`).

## Screen Reader Support

### ARIA Live Regions

An invisible `aria-live="polite"` region announces real-time events to screen readers:

- **Presence:** "[User] joined the board" / "[User] left the board"
- **Object creation:** "Sticky note created", "Rectangle created", "Frame created", etc.
- **Object deletion:** "3 objects deleted"
- **AI results:** "AI created 4 objects"

These announcements use a clear-then-set pattern (100ms delay) to ensure screen readers re-read changed content.

### ARIA Landmark Roles

| Element | Role | Label |
|---------|------|-------|
| Canvas container | `application` | "Whiteboard canvas. Use Tab to cycle through objects..." |
| Creation toolbar | `toolbar` | "Board creation tools" |
| Selection actions bar | `toolbar` | "Selection actions" |
| AI chat messages | `log` | "AI assistant conversation" |
| Presence bar | `status` | "N users online" |
| Connection banner | `alert` | (Reconnecting notification) |

### Button Labels

All toolbar buttons have `aria-label` attributes describing their function:
- "Add sticky note", "Add rectangle", "Add circle", "Add line", "Add text", "Add frame"
- "Connect two objects" (with `aria-pressed` state)
- "Open AI assistant" / "Close AI assistant"
- "Change color", "Duplicate selected objects", "Delete selected objects"
- "Enable/Disable high contrast mode" (with `aria-pressed` state)

Color picker buttons include the color name: "Set note color to Blue", "Set shape color to Orange", etc.

## Accessible Toolbar

All toolbar buttons are:
- Keyboard-focusable (standard `<button>` elements)
- Visually indicated when focused (`focus:ring-2 focus:ring-blue-500`)
- Labeled for screen readers (`aria-label`)
- Decorated icons are marked `aria-hidden="true"` to avoid reading emoji/symbols

## Technical Implementation

| Feature | File(s) |
|---------|---------|
| Colorblind palette | `lib/colors.ts` |
| High-contrast context | `lib/hooks/useHighContrast.ts` |
| ARIA announcer | `components/ui/AriaLiveAnnouncer.tsx` |
| Keyboard navigation | `components/canvas/Board.tsx` |
| High-contrast toggle | `components/canvas/BoardWrapper.tsx` |
| Presence announcements | `components/canvas/BoardWrapper.tsx` |
| AI announcements | `components/collaboration/AiChat.tsx` |
