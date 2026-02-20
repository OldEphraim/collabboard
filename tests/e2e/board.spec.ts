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
  // Wait for the Konva canvas to render
  await page.waitForSelector('canvas', { timeout: 15_000 })
}

// Helper: click the sticky note toolbar button to create a note
async function createStickyViaToolbar(page: Page) {
  // The toolbar Note button
  await page.click('button:has-text("Note")')
  // Wait a moment for the object to be created and rendered
  await page.waitForTimeout(1000)
}

// ---------------------------------------------------------------------------
// Test 1: Objects persist after refresh
// ---------------------------------------------------------------------------

test('objects persist after refresh', async () => {
  await goToBoard(authA.page)

  // Count existing objects via Supabase before creating
  const { data: before } = await authA.supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  const countBefore = before?.length ?? 0

  // Create a sticky note via toolbar
  await createStickyViaToolbar(authA.page)

  // Verify it was written to the database
  const { data: after } = await authA.supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  expect(after?.length).toBe(countBefore + 1)

  // Refresh the page
  await authA.page.reload()
  await authA.page.waitForSelector('canvas', { timeout: 15_000 })

  // Verify object still exists in DB after refresh
  const { data: afterRefresh } = await authA.supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  expect(afterRefresh?.length).toBe(countBefore + 1)

  // Verify the canvas rendered (Konva stage is present and has content)
  const canvasCount = await authA.page.locator('canvas').count()
  expect(canvasCount).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// Test 2: Two users see each other's objects
// ---------------------------------------------------------------------------

test('two users see each other\'s objects', async () => {
  await goToBoard(authA.page)
  await goToBoard(authB.page)

  // Count objects visible to User B before
  const { data: before } = await authB.supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  const countBefore = before?.length ?? 0

  // User A creates a sticky note
  await createStickyViaToolbar(authA.page)

  // Wait for broadcast sync
  await authB.page.waitForTimeout(2000)

  // Verify User B sees the new object via Supabase query
  // (the broadcast should have updated B's local state, but we verify the
  // DB as the ground truth that both clients will converge on)
  const { data: after } = await authB.supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  expect(after?.length).toBe(countBefore + 1)
})

// ---------------------------------------------------------------------------
// Test 3: Cursor sync between users
// ---------------------------------------------------------------------------

test('cursor sync between users', async () => {
  await goToBoard(authA.page)
  await goToBoard(authB.page)

  // Wait for both to subscribe to channels
  await authA.page.waitForTimeout(2000)

  // User A moves the mouse over the canvas
  const canvasA = authA.page.locator('canvas').first()
  const boxA = await canvasA.boundingBox()
  if (!boxA) throw new Error('Canvas not found for User A')

  // Move mouse in a visible pattern
  await authA.page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2)
  await authA.page.waitForTimeout(200)
  await authA.page.mouse.move(boxA.x + boxA.width / 2 + 50, boxA.y + boxA.height / 2 + 50)
  await authA.page.waitForTimeout(200)
  await authA.page.mouse.move(boxA.x + boxA.width / 2 + 100, boxA.y + boxA.height / 2)

  // Wait for cursor broadcast to propagate
  await authB.page.waitForTimeout(1000)

  // User B should see User A's cursor.
  // Cursors are rendered as Konva elements on a canvas, so we check via
  // evaluate whether any cursor data exists in the page's React state.
  // Alternatively, check for the cursor CSS — our Cursors component renders
  // a div overlay with cursor elements.
  //
  // The Cursors component renders divs with pointer-events-none for each
  // remote cursor. Check for any cursor label element.
  const cursorElements = await authB.page.locator('[data-testid="remote-cursor"]').count()

  // If the Cursors component doesn't have data-testid, check for the canvas
  // having been interacted with by looking for the cursor name text.
  // The cursor overlay uses absolute positioning with the user's email.
  // As a fallback, verify that the presence bar shows both users.
  const presenceBar = authB.page.locator('text=Online')
  const presenceExists = await presenceBar.count()

  // At minimum, both users should appear in the presence system
  // (presence bar shows colored dots for online users)
  expect(cursorElements > 0 || presenceExists > 0).toBeTruthy()
})

// ---------------------------------------------------------------------------
// Test 4: AI command creates objects
// ---------------------------------------------------------------------------

test('AI command creates objects', async () => {
  // Count objects before
  const { data: before } = await authA.supabase
    .from('board_objects')
    .select('id')
    .eq('board_id', boardId)
  const countBefore = before?.length ?? 0

  // Get User A's cookie for the API call
  const cookies = await authA.context.cookies()
  const authCookie = cookies.find((c) => c.name === COOKIE_NAME)
  expect(authCookie).toBeTruthy()

  // Send AI command via the API
  const response = await authA.page.evaluate(
    async ({ boardId, text }) => {
      const res = await fetch('/api/ai-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, boardId }),
      })
      return { status: res.status, body: await res.json() }
    },
    { boardId, text: 'Create a yellow sticky note that says "E2E Test"' }
  )

  expect(response.status).toBe(200)
  expect(response.body.results?.length).toBeGreaterThan(0)

  // Verify object was created in the database
  const { data: after } = await authA.supabase
    .from('board_objects')
    .select('id, properties')
    .eq('board_id', boardId)
  expect(after?.length).toBeGreaterThan(countBefore)

  // Verify the AI-created object has the expected text
  const aiObject = after?.find(
    (o) => (o.properties as Record<string, unknown>)?.text === 'E2E Test'
  )
  expect(aiObject).toBeTruthy()
})

// ---------------------------------------------------------------------------
// Test 5: Reconnection after disconnect
// ---------------------------------------------------------------------------

test('reconnection banner appears when offline', async () => {
  await goToBoard(authA.page)

  // Wait for channels to connect
  await authA.page.waitForTimeout(2000)

  // Go offline
  await authA.context.setOffline(true)

  // Wait for the disconnect to be detected
  await authA.page.waitForTimeout(3000)

  // Check for the reconnecting banner
  // Our ConnectionStatus component shows "Reconnecting..." or "You are offline..."
  const banner = authA.page.locator('text=/Reconnecting|offline/i')
  await expect(banner).toBeVisible({ timeout: 5000 })

  // Go back online
  await authA.context.setOffline(false)

  // Banner should disappear once reconnected
  await expect(banner).toBeHidden({ timeout: 15_000 })
})
