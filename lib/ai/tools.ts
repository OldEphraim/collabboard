import type Anthropic from '@anthropic-ai/sdk'

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'create_sticky_note',
    description:
      'Create a new sticky note on the board. Use for ideas, tasks, labels, or any short text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text content of the sticky note' },
        x: { type: 'number', description: 'X position in pixels (0 = left edge)' },
        y: { type: 'number', description: 'Y position in pixels (0 = top edge)' },
        color: {
          type: 'string',
          enum: ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'],
          description: 'Color of the sticky note',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_shape',
    description: 'Create a shape (rectangle or circle) on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        shape_type: {
          type: 'string',
          enum: ['rectangle', 'circle'],
          description: 'Type of shape to create',
        },
        x: { type: 'number', description: 'X position in pixels' },
        y: { type: 'number', description: 'Y position in pixels' },
        width: { type: 'number', description: 'Width in pixels' },
        height: { type: 'number', description: 'Height in pixels' },
        fill: { type: 'string', description: 'Fill color (hex, e.g. #DBEAFE)' },
        stroke: { type: 'string', description: 'Border color (hex, e.g. #3B82F6)' },
      },
      required: ['shape_type'],
    },
  },
  {
    name: 'create_text',
    description: 'Create standalone text on the board (not a sticky note).',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Text content' },
        x: { type: 'number', description: 'X position in pixels' },
        y: { type: 'number', description: 'Y position in pixels' },
        fontSize: { type: 'number', description: 'Font size in pixels (default 18)' },
        fill: { type: 'string', description: 'Text color (hex)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_frame',
    description:
      'Create a frame/container to visually group content. Frames have a title bar and a bordered area.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Frame title displayed in the title bar' },
        x: { type: 'number', description: 'X position in pixels' },
        y: { type: 'number', description: 'Y position in pixels' },
        width: { type: 'number', description: 'Width in pixels (default 400)' },
        height: { type: 'number', description: 'Height in pixels (default 300)' },
        stroke: { type: 'string', description: 'Frame border/title color (hex)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_connector',
    description:
      'Create an arrow connector between two existing objects on the board. Requires the IDs of both objects.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromId: { type: 'string', description: 'ID of the source object' },
        toId: { type: 'string', description: 'ID of the target object' },
        stroke: { type: 'string', description: 'Arrow color (hex)' },
      },
      required: ['fromId', 'toId'],
    },
  },
  {
    name: 'move_object',
    description: 'Move an existing object to a new position.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to move' },
        x: { type: 'number', description: 'New X position in pixels' },
        y: { type: 'number', description: 'New Y position in pixels' },
      },
      required: ['objectId', 'x', 'y'],
    },
  },
  {
    name: 'resize_object',
    description: 'Resize an existing object.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to resize' },
        width: { type: 'number', description: 'New width in pixels' },
        height: { type: 'number', description: 'New height in pixels' },
      },
      required: ['objectId', 'width', 'height'],
    },
  },
  {
    name: 'update_text',
    description:
      'Update the text content of a sticky note or text element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to update' },
        text: { type: 'string', description: 'New text content' },
      },
      required: ['objectId', 'text'],
    },
  },
  {
    name: 'change_color',
    description:
      'Change the color of a sticky note or shape. For sticky notes use color names (yellow, blue, green, pink, purple, orange). For shapes use hex colors for fill and stroke.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to recolor' },
        color: {
          type: 'string',
          description:
            'For sticky notes: yellow, blue, green, pink, purple, orange. For shapes: hex color for fill.',
        },
        stroke: {
          type: 'string',
          description: 'For shapes only: hex color for the border/stroke.',
        },
      },
      required: ['objectId', 'color'],
    },
  },
  {
    name: 'delete_object',
    description: 'Delete an object from the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objectId: { type: 'string', description: 'ID of the object to delete' },
      },
      required: ['objectId'],
    },
  },
  {
    name: 'get_board_state',
    description:
      'Get the current state of all objects on the board. Use this when you need to reference existing objects by ID or understand the current layout.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]
