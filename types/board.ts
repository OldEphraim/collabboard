export type BoardObjectType =
  | 'sticky_note'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'frame'
  | 'connector'
  | 'text'

export interface Board {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface BoardObject {
  id: string
  board_id: string
  type: BoardObjectType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  z_index: number
  properties: Record<string, unknown>
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface StickyNoteProperties {
  text: string
  color: string
  fontSize?: number
}

export interface ShapeProperties {
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface TextProperties {
  text: string
  fontSize: number
  fontFamily?: string
  fill?: string
}

export interface ConnectorProperties {
  fromId: string
  toId: string
  stroke?: string
  strokeWidth?: number
  style?: 'arrow' | 'line'
}

export interface LineProperties {
  stroke?: string
  strokeWidth?: number
  points: number[] // [0, 0, endX, endY] relative to object x,y
}

export interface FrameProperties {
  title?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}
