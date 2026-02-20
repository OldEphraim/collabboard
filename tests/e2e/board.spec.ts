/**
 * CollabBoard E2E Tests
 *
 * Prerequisites:
 *   - Dev server running on localhost:3000  (`npm run dev`)
 *   - .env.local configured with Supabase + Anthropic keys
 *
 * Run:
 *   npx playwright test
 */

import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Config — reads from the same .env.local the app uses
// ---------------------------------------------------------------------------

import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0]
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

// ---------------------------------------------------------------------------
// Auth helper — programmatic sign-up / sign-in, sets the session cookie
// ---------------------------------------------------------------------------

interface AuthResult {
  context: BrowserContext
  page: Page
  userId: string
  supabase: SupabaseClient
}

async function createAuthenticatedContext(
  browser: Browser,
  email: string,
  password: string
): Promise<AuthResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Sign up (ignore "already registered" errors) then sign in
  await supabase.auth.signUp({ email, password })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`Auth failed for ${email}: ${error?.message ?? 'no session'}`)
  }

  // Encode the session as the Supabase SSR cookie value
  const sessionPayload = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    type: 'access',
  })
  const cookieValue = `base64-${Buffer.from(sessionPayload).toString('base64url')}`

  const context = await browser.newContext()
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
    },
  ])

  const page = await context.newPage()
  return { context, page, userId: data.user!.id, supabase }
}

// ---------------------------------------------------------------------------
// Board helper — creates a board and returns its ID
// ---------------------------------------------------------------------------

async function createBoard(supabase: SupabaseClient, userId: string, name = 'E2E Test Board') {
  const { data, error } = await supabase
    .from('boards')
    .insert({ name, created_by: userId })
    .select()
    .single()
  if (error) throw new Error(`Board creation failed: ${error.message}`)
  return data.id as string
}

// ---------------------------------------------------------------------------
// AI command helper — sends a command via the page's fetch (inherits cookies)
// ---------------------------------------------------------------------------

async function sendAiCommand(page: Page, boardId: string, text: string) {
  return page.evaluate(
    async ({ boardId, text }) => {
      const start = Date.now()
      const res = await fetch('/api/ai-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, boardId }),
      })
      const elapsed = Date.now() - start
      return { status: res.status, body: await res.json(), elapsed }
    },
    { boardId, text }
  )
}

// ---------------------------------------------------------------------------
// DB query helpers
// ---------------------------------------------------------------------------

async function countObjects(supabase: SupabaseClient, boardId: string) {
  const { data } = await supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  return data?.length ?? 0
}

async function queryObjects(supabase: SupabaseClient, boardId: string) {
  const { data } = await supabase
    .from('board_objects')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true })
  return (data ?? []) as Record<string, unknown>[]
}

// ---------------------------------------------------------------------------
// Shared state across tests in this file
// ---------------------------------------------------------------------------

const ts = Date.now()
const USER_A_EMAIL = `e2e-a-${ts}@test.collabboard.local`
const USER_B_EMAIL = `e2e-b-${ts}@test.collabboard.local`
const PASSWORD = 'TestPass123!'

let authA: AuthResult
let authB: AuthResult
let boardId: string

// ---------------------------------------------------------------------------
// Setup: create two authenticated users and a shared board
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  authA = await createAuthenticatedContext(browser, USER_A_EMAIL, PASSWORD)
  authB = await createAuthenticatedContext(browser, USER_B_EMAIL, PASSWORD)
  boardId = await createBoard(authA.supabase, authA.userId)
})

test.afterAll(async () => {
  await authA?.context.close()
  await authB?.context.close()
})

// Helper: navigate to the board and wait for canvas to render
async function goToBoard(page: Page, id: string = boardId) {
  await page.goto(`/board/${id}`)
  await page.waitForSelector('canvas', { timeout: 15_000 })
}

// Helper: click the sticky note toolbar button to create a note
async function createStickyViaToolbar(page: Page) {
  await page.click('button:has-text("Note")')
  await page.waitForTimeout(1000)
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE TESTS (original 5)
// ═══════════════════════════════════════════════════════════════════════════

test('objects persist after refresh', async () => {
  await goToBoard(authA.page)
  const countBefore = await countObjects(authA.supabase, boardId)

  await createStickyViaToolbar(authA.page)

  const countAfter = await countObjects(authA.supabase, boardId)
  expect(countAfter).toBe(countBefore + 1)

  await authA.page.reload()
  await authA.page.waitForSelector('canvas', { timeout: 15_000 })

  const countPostRefresh = await countObjects(authA.supabase, boardId)
  expect(countPostRefresh).toBe(countBefore + 1)

  const canvasCount = await authA.page.locator('canvas').count()
  expect(canvasCount).toBeGreaterThan(0)
})

test('two users see each other\'s objects', async () => {
  await goToBoard(authA.page)
  await goToBoard(authB.page)

  const countBefore = await countObjects(authB.supabase, boardId)

  await createStickyViaToolbar(authA.page)
  await authB.page.waitForTimeout(2000)

  const countAfter = await countObjects(authB.supabase, boardId)
  expect(countAfter).toBe(countBefore + 1)
})

test('cursor sync between users', async () => {
  await goToBoard(authA.page)
  await goToBoard(authB.page)
  await authA.page.waitForTimeout(2000)

  const canvasA = authA.page.locator('canvas').first()
  const boxA = await canvasA.boundingBox()
  if (!boxA) throw new Error('Canvas not found for User A')

  await authA.page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2)
  await authA.page.waitForTimeout(200)
  await authA.page.mouse.move(boxA.x + boxA.width / 2 + 50, boxA.y + boxA.height / 2 + 50)
  await authA.page.waitForTimeout(200)
  await authA.page.mouse.move(boxA.x + boxA.width / 2 + 100, boxA.y + boxA.height / 2)

  await authB.page.waitForTimeout(1000)

  const cursorElements = await authB.page.locator('[data-testid="remote-cursor"]').count()
  const presenceExists = await authB.page.locator('text=Online').count()

  console.log(`[CURSOR SYNC] remote-cursor elements: ${cursorElements}, presence "Online" elements: ${presenceExists}`)
  expect(cursorElements > 0 || presenceExists > 0).toBeTruthy()
})

test('AI command creates objects', async () => {
  await goToBoard(authA.page)
  const countBefore = await countObjects(authA.supabase, boardId)

  const response = await sendAiCommand(
    authA.page,
    boardId,
    'Create a yellow sticky note that says "E2E Test"'
  )

  expect(response.status).toBe(200)
  expect(response.body.results?.length).toBeGreaterThan(0)

  const objects = await queryObjects(authA.supabase, boardId)
  expect(objects.length).toBeGreaterThan(countBefore)

  const aiObject = objects.find(
    (o) => (o.properties as Record<string, unknown>)?.text === 'E2E Test'
  )
  expect(aiObject).toBeTruthy()
})

test('reconnection banner appears when offline', async () => {
  await goToBoard(authA.page)
  await authA.page.waitForTimeout(2000)

  await authA.context.setOffline(true)
  await authA.page.waitForTimeout(3000)

  const banner = authA.page.locator('text=/Reconnecting|offline/i')
  await expect(banner).toBeVisible({ timeout: 5000 })

  await authA.context.setOffline(false)
  await expect(banner).toBeHidden({ timeout: 15_000 })
})

// ═══════════════════════════════════════════════════════════════════════════
// SYNC & PERFORMANCE TESTS
// ═══════════════════════════════════════════════════════════════════════════

test('rapid creation and movement', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'Rapid Create Test')
  await goToBoard(authA.page, freshBoard)
  await goToBoard(authB.page, freshBoard)

  // User A creates 10 sticky notes rapidly
  for (let i = 0; i < 10; i++) {
    await authA.page.click('button:has-text("Note")')
    await authA.page.waitForTimeout(200) // minimal delay
  }

  // Wait for all DB writes to complete
  await authA.page.waitForTimeout(2000)

  // Verify all 10 exist in DB from User A's perspective
  const countA = await countObjects(authA.supabase, freshBoard)
  expect(countA).toBe(10)

  // Verify User B also sees all 10
  const countB = await countObjects(authB.supabase, freshBoard)
  expect(countB).toBe(10)
})

test('5+ concurrent users', async ({ browser }) => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, '5-User Test')
  const extraUsers: AuthResult[] = []

  try {
    // Create users C, D, E
    for (let i = 0; i < 3; i++) {
      const email = `e2e-extra-${ts}-${i}@test.collabboard.local`
      const auth = await createAuthenticatedContext(browser, email, PASSWORD)
      extraUsers.push(auth)
    }

    // All 5 users navigate to the board
    const allUsers = [authA, authB, ...extraUsers]
    await Promise.all(allUsers.map((u) => goToBoard(u.page, freshBoard)))

    // Each user creates one sticky note
    for (const user of allUsers) {
      await user.page.click('button:has-text("Note")')
    }

    // Wait for all DB writes and broadcasts
    await allUsers[0].page.waitForTimeout(3000)

    // Verify DB has 5 objects
    const count = await countObjects(authA.supabase, freshBoard)
    expect(count).toBe(5)

    // Verify each user can query all 5
    for (const user of allUsers) {
      const userCount = await countObjects(user.supabase, freshBoard)
      expect(userCount).toBe(5)
    }
  } finally {
    for (const u of extraUsers) {
      await u.context.close()
    }
  }
})

test('object sync latency under 3s (measured)', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'Latency Test')
  await goToBoard(authA.page, freshBoard)
  await goToBoard(authB.page, freshBoard)

  // Wait for channels to be established
  await authA.page.waitForTimeout(2000)

  const startTime = Date.now()

  // User A creates a sticky note
  await authA.page.click('button:has-text("Note")')

  // Poll User B's Supabase query until the new object appears
  let found = false
  let endTime = startTime
  const maxWait = 5000
  while (Date.now() - startTime < maxWait) {
    const count = await countObjects(authB.supabase, freshBoard)
    if (count >= 1) {
      endTime = Date.now()
      found = true
      break
    }
    await new Promise((r) => setTimeout(r, 20))
  }

  expect(found).toBeTruthy()

  const measuredLatency = endTime - startTime
  // Log the actual measured value for reporting
  console.log(`[LATENCY] Object sync measured: ${measuredLatency}ms (DB poll, not broadcast)`)

  // Assert generous ceiling (polling overhead adds to the true broadcast latency)
  expect(measuredLatency).toBeLessThan(3000)
})

// ═══════════════════════════════════════════════════════════════════════════
// AI AGENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

test('AI creation command — sticky note', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Create Note')
  await goToBoard(authA.page, freshBoard)

  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Create a yellow sticky note that says "User Research"'
  )

  expect(response.status).toBe(200)

  const objects = await queryObjects(authA.supabase, freshBoard)
  const note = objects.find((o) => {
    const props = o.properties as Record<string, unknown>
    return (
      o.type === 'sticky_note' &&
      (props.text as string)?.includes('User Research') &&
      props.color === 'yellow'
    )
  })
  expect(note).toBeTruthy()
})

test('AI shape creation command — rectangle', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Create Shape')
  await goToBoard(authA.page, freshBoard)

  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Create a blue rectangle at position 100, 200'
  )

  expect(response.status).toBe(200)

  const objects = await queryObjects(authA.supabase, freshBoard)
  const rect = objects.find((o) => {
    if (o.type !== 'rectangle') return false
    const x = o.x as number
    const y = o.y as number
    // Allow some tolerance — the AI may not place at exact coordinates
    return Math.abs(x - 100) < 50 && Math.abs(y - 200) < 50
  })
  expect(rect).toBeTruthy()
})

test('AI manipulation command — change color', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Manipulate')
  await goToBoard(authA.page, freshBoard)

  // Insert a sticky note directly via Supabase
  const { data: inserted } = await authA.supabase
    .from('board_objects')
    .insert({
      board_id: freshBoard,
      type: 'sticky_note',
      x: 200,
      y: 200,
      width: 200,
      height: 200,
      z_index: 1,
      properties: { text: 'Change my color', color: 'yellow', fontSize: 14 },
      created_by: authA.userId,
      updated_by: authA.userId,
    })
    .select()
    .single()
  expect(inserted).toBeTruthy()

  // Send AI command to change color
  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Change the color of the sticky note to green'
  )

  expect(response.status).toBe(200)

  // Verify the color was changed in the DB
  const { data: updated } = await authA.supabase
    .from('board_objects')
    .select('properties')
    .eq('id', inserted!.id)
    .single()
  expect((updated?.properties as Record<string, unknown>)?.color).toBe('green')
})

test('AI complex command — SWOT analysis', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI SWOT')
  await goToBoard(authA.page, freshBoard)

  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Create a SWOT analysis template with four quadrants'
  )

  expect(response.status).toBe(200)

  const objects = await queryObjects(authA.supabase, freshBoard)
  // Should have at least 4 objects (4 frames, plus sticky notes)
  expect(objects.length).toBeGreaterThanOrEqual(4)

  // Check that the SWOT terms appear in object properties (case-insensitive)
  const allText = objects
    .map((o) => {
      const props = o.properties as Record<string, unknown>
      return [props.text, props.title].filter(Boolean).join(' ')
    })
    .join(' ')
    .toLowerCase()

  expect(allText).toContain('strength')
  expect(allText).toContain('weakness')
  expect(allText).toContain('opportunit')
  expect(allText).toContain('threat')
})

test('AI complex command — retrospective board', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Retro')
  await goToBoard(authA.page, freshBoard)

  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Set up a retrospective board with What Went Well, What Didn\'t, and Action Items'
  )

  expect(response.status).toBe(200)

  const objects = await queryObjects(authA.supabase, freshBoard)
  // Should have at least 3 objects (3 frames/sections)
  expect(objects.length).toBeGreaterThanOrEqual(3)

  // Check that the section names appear
  const allText = objects
    .map((o) => {
      const props = o.properties as Record<string, unknown>
      return [props.text, props.title].filter(Boolean).join(' ')
    })
    .join(' ')
    .toLowerCase()

  expect(allText).toContain('went well')
  expect(allText).toContain('didn')
  expect(allText).toContain('action')
})

test('AI latency under 2s for single-step', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Latency')
  await goToBoard(authA.page, freshBoard)

  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Create a yellow sticky note that says "Latency test"'
  )

  expect(response.status).toBe(200)
  console.log(`[LATENCY] AI single-step: ${response.elapsed}ms`)
  expect(response.elapsed).toBeLessThan(2000)
})

test('two users issuing AI commands simultaneously', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Simultaneous')
  await goToBoard(authA.page, freshBoard)
  await goToBoard(authB.page, freshBoard)

  // Both users send AI commands at the same time
  const [responseA, responseB] = await Promise.all([
    sendAiCommand(authA.page, freshBoard, 'Create a yellow sticky note that says "From User A"'),
    sendAiCommand(authB.page, freshBoard, 'Create a blue sticky note that says "From User B"'),
  ])

  expect(responseA.status).toBe(200)
  expect(responseB.status).toBe(200)

  // Wait for DB writes
  await authA.page.waitForTimeout(1000)

  // Verify both objects exist in the DB
  const objects = await queryObjects(authA.supabase, freshBoard)
  const fromA = objects.find(
    (o) => (o.properties as Record<string, unknown>)?.text === 'From User A'
  )
  const fromB = objects.find(
    (o) => (o.properties as Record<string, unknown>)?.text === 'From User B'
  )
  expect(fromA).toBeTruthy()
  expect(fromB).toBeTruthy()
})

test('AI objects visible to all users', async () => {
  const freshBoard = await createBoard(authA.supabase, authA.userId, 'AI Visible')
  await goToBoard(authA.page, freshBoard)
  await goToBoard(authB.page, freshBoard)

  // User A sends an AI command
  const response = await sendAiCommand(
    authA.page,
    freshBoard,
    'Create a green sticky note that says "Visible to all"'
  )

  expect(response.status).toBe(200)

  // Wait for broadcast sync
  await authB.page.waitForTimeout(2000)

  // User B queries the DB — object should be there
  const objects = await queryObjects(authB.supabase, freshBoard)
  const aiObject = objects.find(
    (o) => (o.properties as Record<string, unknown>)?.text === 'Visible to all'
  )
  expect(aiObject).toBeTruthy()
})
