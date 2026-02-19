#!/usr/bin/env npx tsx
/**
 * Bulk-create 50+ objects on a board for sync performance and capacity testing.
 *
 * Usage:
 *   npx tsx scripts/test-bulk-create.ts <boardId> [count]
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Defaults to 60 objects if count is not specified.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const boardId = process.argv[2]
const count = parseInt(process.argv[3] || '60', 10)

if (!boardId) {
  console.error('Usage: npx tsx scripts/test-bulk-create.ts <boardId> [count]')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']
const SHAPE_FILLS = ['#DBEAFE', '#FEE2E2', '#D1FAE5', '#FEF3C7', '#EDE9FE', '#FCE7F3']
const SHAPE_STROKES = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']

const TYPES = ['sticky_note', 'rectangle', 'circle', 'text', 'frame'] as const

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function main() {
  // Look up the board creator to use as created_by
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('created_by')
    .eq('id', boardId)
    .single()

  if (boardError || !board) {
    console.error('Board not found:', boardError?.message ?? 'no data')
    process.exit(1)
  }

  const userId = board.created_by
  console.log(`Creating ${count} objects on board ${boardId}...`)

  // Arrange in a grid: ~10 columns
  const cols = 10
  const spacingX = 230
  const spacingY = 230
  const startX = 50
  const startY = 50

  const objects = Array.from({ length: count }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const type = TYPES[i % TYPES.length]
    const x = startX + col * spacingX + randomBetween(-10, 10)
    const y = startY + row * spacingY + randomBetween(-10, 10)

    let properties: Record<string, unknown> = {}
    let width = 150
    let height = 100

    switch (type) {
      case 'sticky_note':
        width = 200
        height = 200
        properties = {
          text: `Note #${i + 1}`,
          color: COLORS[i % COLORS.length],
          fontSize: 14,
        }
        break
      case 'rectangle':
        width = 150
        height = 100
        properties = {
          fill: SHAPE_FILLS[i % SHAPE_FILLS.length],
          stroke: SHAPE_STROKES[i % SHAPE_STROKES.length],
          strokeWidth: 2,
        }
        break
      case 'circle':
        width = 100
        height = 100
        properties = {
          fill: SHAPE_FILLS[i % SHAPE_FILLS.length],
          stroke: SHAPE_STROKES[i % SHAPE_STROKES.length],
          strokeWidth: 2,
        }
        break
      case 'text':
        width = 200
        height = 30
        properties = {
          text: `Text element #${i + 1}`,
          fontSize: 18,
          fill: '#1F2937',
        }
        break
      case 'frame':
        width = 200
        height = 200
        properties = {
          title: `Frame #${i + 1}`,
          fill: 'rgba(249, 250, 251, 0.5)',
          stroke: '#6B7280',
          strokeWidth: 1,
        }
        break
    }

    return {
      board_id: boardId,
      type,
      x,
      y,
      width,
      height,
      rotation: 0,
      z_index: i + 1,
      properties,
      created_by: userId,
      updated_by: userId,
    }
  })

  // Insert in batches of 20 to avoid payload limits
  const BATCH_SIZE = 20
  let inserted = 0
  const startTime = performance.now()

  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('board_objects').insert(batch)
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\r  Inserted ${inserted}/${count}`)
    }
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
  console.log(`\nDone! Created ${inserted} objects in ${elapsed}s`)
  console.log(`Open the board to verify sync and rendering performance.`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
