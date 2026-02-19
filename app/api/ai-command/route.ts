import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { toolDefinitions } from '@/lib/ai/tools'
import type { BoardObject } from '@/types/board'

export const maxDuration = 30

interface AiResult {
  action: 'create' | 'update' | 'delete'
  object: BoardObject
}

// Detect whether a command needs multi-step tool use (templates, layouts, etc.)
const COMPLEX_PATTERN = /swot|journey|retrospective|retro\b|template|analysis|kanban|brainstorm|arrange|layout|grid|organize|roadmap|mindmap|mind map|flowchart/i

function isComplexCommand(text: string): boolean {
  return COMPLEX_PATTERN.test(text)
}

// Build a board-state summary string
function boardStateSummary(objects: BoardObject[]): string {
  if (objects.length === 0) return '(empty board)'
  return objects
    .map(
      (o) =>
        `- [${o.type}] id="${o.id}" at (${Math.round(o.x)}, ${Math.round(o.y)}) ${o.width}x${o.height} properties=${JSON.stringify(o.properties)}`
    )
    .join('\n')
}

const BASE_SYSTEM_PROMPT = `You are an AI assistant for CollabBoard, a collaborative whiteboard application.
You help users create, modify, and arrange objects on the board using the provided tools.

BOARD COORDINATE SYSTEM:
- (0, 0) is the top-left corner. X increases right, Y increases down.
- Typical viewport: ~1200x800 pixels, center ~(600, 400).

OBJECT SIZES: Sticky notes 200x200, frames ~450x350, text ~200x30, shapes default 150x100.

GUIDELINES:
- Space objects with 20px+ gaps. Start at (50, 50) when no position given.
- Frame title bars are 28px tall; place content inside at frame.y + 40.
- Call get_board_state first when modifying existing objects.`

const TEMPLATE_RECIPES = `

TEMPLATE RECIPES (use these exact layouts):

SWOT Analysis:
- 4 frames in 2x2 grid: Strengths (50,50), Weaknesses (520,50), Opportunities (50,420), Threats (520,420), each 450x350
- 2-3 sticky notes per frame. Colors: green=Strengths, blue=Weaknesses, yellow=Opportunities, pink=Threats

User Journey Map:
- Title text at (50,30). 5 frames horizontal: each ~240x350, starting (50,80) with 20px gaps
- Stages: Awareness, Consideration, Purchase, Onboarding, Retention. 2-3 notes per frame.

Retrospective Board:
- 3 frames side by side: "What Went Well" (50,50), "What Didn't Go Well" (520,50), "Action Items" (990,50), each 450x500
- Colors: green=Went Well, pink=Didn't, blue=Actions. 2-3 starter notes per frame.

IMPORTANT: Create ALL frames first, then add sticky notes inside them.
For "arrange"/"layout" commands, call get_board_state first, then use move_object.`

function buildSystemPrompt(objects: BoardObject[], complex: boolean): string {
  const state = `\n\nCURRENT BOARD STATE (${objects.length} objects):\n${boardStateSummary(objects)}`
  return BASE_SYSTEM_PROMPT + (complex ? TEMPLATE_RECIPES : '') + state
}

// Generate a summary message from results so we can skip a final LLM round-trip
function summarizeResults(results: AiResult[]): string {
  const created = results.filter((r) => r.action === 'create').length
  const updated = results.filter((r) => r.action === 'update').length
  const deleted = results.filter((r) => r.action === 'delete').length
  const parts: string[] = []
  if (created) parts.push(`Created ${created} object${created > 1 ? 's' : ''}`)
  if (updated) parts.push(`Updated ${updated} object${updated > 1 ? 's' : ''}`)
  if (deleted) parts.push(`Deleted ${deleted} object${deleted > 1 ? 's' : ''}`)
  return parts.join('. ') + '.'
}

// Execute a single tool call against Supabase
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  boardId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  zIndex: { current: number }
): Promise<{ result: AiResult | null; response: string }> {
  switch (name) {
    case 'create_sticky_note': {
      const { data, error } = await supabase
        .from('board_objects')
        .insert({
          board_id: boardId,
          type: 'sticky_note',
          x: (input.x as number) ?? 100,
          y: (input.y as number) ?? 100,
          width: 200,
          height: 200,
          z_index: ++zIndex.current,
          properties: {
            text: input.text as string,
            color: (input.color as string) ?? 'yellow',
            fontSize: 14,
          },
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'create', object: data as BoardObject },
        response: `Created sticky note "${input.text}" at (${data.x}, ${data.y})`,
      }
    }

    case 'create_shape': {
      const shapeType = (input.shape_type as string) ?? 'rectangle'
      const { data, error } = await supabase
        .from('board_objects')
        .insert({
          board_id: boardId,
          type: shapeType,
          x: (input.x as number) ?? 100,
          y: (input.y as number) ?? 100,
          width: (input.width as number) ?? 150,
          height: (input.height as number) ?? 100,
          z_index: ++zIndex.current,
          properties: {
            fill: (input.fill as string) ?? '#DBEAFE',
            stroke: (input.stroke as string) ?? '#3B82F6',
            strokeWidth: 2,
          },
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'create', object: data as BoardObject },
        response: `Created ${shapeType} at (${data.x}, ${data.y})`,
      }
    }

    case 'create_text': {
      const { data, error } = await supabase
        .from('board_objects')
        .insert({
          board_id: boardId,
          type: 'text',
          x: (input.x as number) ?? 100,
          y: (input.y as number) ?? 100,
          width: 200,
          height: 30,
          z_index: ++zIndex.current,
          properties: {
            text: input.text as string,
            fontSize: (input.fontSize as number) ?? 18,
            fill: (input.fill as string) ?? '#1F2937',
          },
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'create', object: data as BoardObject },
        response: `Created text "${input.text}" at (${data.x}, ${data.y})`,
      }
    }

    case 'create_frame': {
      const { data, error } = await supabase
        .from('board_objects')
        .insert({
          board_id: boardId,
          type: 'frame',
          x: (input.x as number) ?? 50,
          y: (input.y as number) ?? 50,
          width: (input.width as number) ?? 400,
          height: (input.height as number) ?? 300,
          z_index: ++zIndex.current,
          properties: {
            title: input.title as string,
            fill: 'rgba(249, 250, 251, 0.5)',
            stroke: (input.stroke as string) ?? '#6B7280',
            strokeWidth: 1,
          },
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'create', object: data as BoardObject },
        response: `Created frame "${input.title}" at (${data.x}, ${data.y})`,
      }
    }

    case 'create_connector': {
      const { data, error } = await supabase
        .from('board_objects')
        .insert({
          board_id: boardId,
          type: 'connector',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          z_index: ++zIndex.current,
          properties: {
            fromId: input.fromId as string,
            toId: input.toId as string,
            stroke: (input.stroke as string) ?? '#6B7280',
            strokeWidth: 2,
          },
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'create', object: data as BoardObject },
        response: `Created connector from ${input.fromId} to ${input.toId}`,
      }
    }

    case 'move_object': {
      const { data, error } = await supabase
        .from('board_objects')
        .update({
          x: input.x as number,
          y: input.y as number,
          updated_by: userId,
        })
        .eq('id', input.objectId as string)
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'update', object: data as BoardObject },
        response: `Moved object to (${input.x}, ${input.y})`,
      }
    }

    case 'resize_object': {
      const { data, error } = await supabase
        .from('board_objects')
        .update({
          width: input.width as number,
          height: input.height as number,
          updated_by: userId,
        })
        .eq('id', input.objectId as string)
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'update', object: data as BoardObject },
        response: `Resized object to ${input.width}x${input.height}`,
      }
    }

    case 'update_text': {
      // Fetch existing object to merge properties
      const { data: existing } = await supabase
        .from('board_objects')
        .select('properties')
        .eq('id', input.objectId as string)
        .single()
      if (!existing) return { result: null, response: 'Object not found' }

      const props = existing.properties as Record<string, unknown>
      const { data, error } = await supabase
        .from('board_objects')
        .update({
          properties: { ...props, text: input.text as string },
          updated_by: userId,
        })
        .eq('id', input.objectId as string)
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'update', object: data as BoardObject },
        response: `Updated text to "${input.text}"`,
      }
    }

    case 'change_color': {
      const { data: existing } = await supabase
        .from('board_objects')
        .select('type, properties')
        .eq('id', input.objectId as string)
        .single()
      if (!existing) return { result: null, response: 'Object not found' }

      const props = existing.properties as Record<string, unknown>
      let newProps: Record<string, unknown>

      if (existing.type === 'sticky_note') {
        newProps = { ...props, color: input.color as string }
      } else {
        newProps = {
          ...props,
          fill: input.color as string,
          stroke: (input.stroke as string) ?? props.stroke,
        }
      }

      const { data, error } = await supabase
        .from('board_objects')
        .update({ properties: newProps, updated_by: userId })
        .eq('id', input.objectId as string)
        .select()
        .single()
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'update', object: data as BoardObject },
        response: `Changed color to ${input.color}`,
      }
    }

    case 'delete_object': {
      const { data: existing } = await supabase
        .from('board_objects')
        .select('*')
        .eq('id', input.objectId as string)
        .single()
      if (!existing) return { result: null, response: 'Object not found' }

      const { error } = await supabase
        .from('board_objects')
        .delete()
        .eq('id', input.objectId as string)
      if (error) return { result: null, response: `Error: ${error.message}` }
      return {
        result: { action: 'delete', object: existing as BoardObject },
        response: `Deleted object ${input.objectId}`,
      }
    }

    case 'get_board_state': {
      const { data } = await supabase
        .from('board_objects')
        .select('*')
        .eq('board_id', boardId)
        .order('z_index', { ascending: true })
      return {
        result: null,
        response: JSON.stringify(
          (data ?? []).map((o) => ({
            id: o.id,
            type: o.type,
            x: o.x,
            y: o.y,
            width: o.width,
            height: o.height,
            properties: o.properties,
          }))
        ),
      }
    }

    default:
      return { result: null, response: `Unknown tool: ${name}` }
  }
}

export async function POST(request: Request) {
  try {
    const { text, boardId } = await request.json()
    if (!text || !boardId) {
      return NextResponse.json({ error: 'Missing text or boardId' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch current board state for context
    const { data: objects } = await supabase
      .from('board_objects')
      .select('*')
      .eq('board_id', boardId)
      .order('z_index', { ascending: true })

    const boardObjects = (objects ?? []) as BoardObject[]

    // Track z_index so new objects stack correctly
    const zIndex = {
      current: boardObjects.reduce((max, o) => Math.max(max, o.z_index ?? 0), 0),
    }

    const complex = isComplexCommand(text)
    const anthropic = new Anthropic()
    const systemPrompt = buildSystemPrompt(boardObjects, complex)

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }]

    const allResults: AiResult[] = []

    // Initial API call
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools: toolDefinitions,
    })

    let iterations = 0
    const MAX_ITERATIONS = 10
    let earlyReturn = false

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
      iterations++

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = []
      const toolNames: string[] = []
      let hasError = false

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          toolNames.push(block.name)
          const { result, response: toolResponse } = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            boardId,
            user.id,
            supabase,
            zIndex
          )
          if (result) allResults.push(result)
          if (toolResponse.startsWith('Error:')) hasError = true
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: toolResponse,
          })
        }
      }

      // Early return: skip the next API call if this was a simple command,
      // all tools succeeded, we have actual CRUD results, and no tool was
      // get_board_state (which signals the model needs to inspect before acting).
      const calledGetState = toolNames.includes('get_board_state')
      if (!complex && !hasError && allResults.length > 0 && !calledGetState) {
        earlyReturn = true
        break
      }

      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResultBlocks })

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools: toolDefinitions,
      })
    }

    // Build response text: auto-summary for early return, Claude's text otherwise
    const textResponse = earlyReturn
      ? summarizeResults(allResults)
      : response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')

    return NextResponse.json({
      message: textResponse,
      results: allResults,
    })
  } catch (err) {
    console.error('[ai-command] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
