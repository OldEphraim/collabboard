/**
 * Colorblind-safe palettes for CollabBoard.
 *
 * Uses blue/orange as the primary contrast pair (IBM Design / Wong palette).
 * All colors are distinguishable under protanopia, deuteranopia, and tritanopia.
 */

// Sticky note fill colors — light pastel variants for backgrounds
export const STICKY_NOTE_COLORS = [
  { key: 'yellow', label: 'Yellow', hex: '#FEF08A' },
  { key: 'blue', label: 'Blue', hex: '#93C5FD' },
  { key: 'orange', label: 'Orange', hex: '#FED7AA' },
  { key: 'purple', label: 'Purple', hex: '#C4B5FD' },
  { key: 'magenta', label: 'Magenta', hex: '#F9A8D4' },
  { key: 'teal', label: 'Teal', hex: '#99F6E4' },
] as const

// Quick lookup: key -> hex
export const STICKY_COLOR_HEX: Record<string, string> = Object.fromEntries(
  STICKY_NOTE_COLORS.map((c) => [c.key, c.hex])
)

// Shape fill/stroke colors — distinguishable under CVD
export const SHAPE_COLORS = [
  { name: 'Blue', fill: '#DBEAFE', stroke: '#3B82F6' },
  { name: 'Orange', fill: '#FED7AA', stroke: '#F97316' },
  { name: 'Purple', fill: '#F3E8FF', stroke: '#A855F7' },
  { name: 'Magenta', fill: '#FCE7F3', stroke: '#EC4899' },
  { name: 'Teal', fill: '#CCFBF1', stroke: '#14B8A6' },
  { name: 'Gray', fill: '#F3F4F6', stroke: '#6B7280' },
] as const

// Saturated cursor/presence colors — all distinguishable under CVD
export const USER_COLORS = [
  '#3B82F6', // Blue
  '#F97316', // Orange
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#EC4899', // Magenta
  '#EAB308', // Yellow
  '#0EA5E9', // Sky blue
  '#D946EF', // Fuchsia
]
