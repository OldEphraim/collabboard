# CollabBoard — Real-Time Collaborative Whiteboard

## What This Is

A production-scale collaborative whiteboard (like Miro) with an AI agent that manipulates the board through natural language. One-week sprint for Gauntlet AI program.

## Stack Decisions (from Pre-Search)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 14 (App Router) + React + TypeScript | Strongest skills, Vercel-native |
| Canvas | react-konva (Konva.js) | Declarative React API, built-in drag/resize/transform |
| Database | PostgreSQL via Supabase | Deep PG expertise, relational model, free tier |
| Real-time | Supabase Realtime (DB changes) + Broadcast (cursors) | Managed WS, no custom server |
| Auth | Supabase Auth (email/password for MVP, OAuth later) | Built-in, RLS integration |
| AI Agent | Anthropic Claude with function calling | Tool-use API for board commands |
| Deployment | Vercel | Zero-config Next.js deploys |

## Critical Architecture Notes

- **Cursor sync uses Supabase Broadcast** (ephemeral, NOT persisted to DB). This avoids thousands of writes/sec.
- **Object sync uses Supabase Realtime** (DB-backed, listens to INSERT/UPDATE/DELETE on `board_objects`).
- **Client-side throttling** is mandatory: batch position updates every 50ms minimum.
- **RLS on every table**. The Supabase anon key is exposed client-side; RLS is the security boundary.
- **JSONB `properties` column** on `board_objects` for type-specific data (text content, color, etc.).
- **No SSR for the board page** — it's a fully client-side interactive canvas. Use `'use client'` directive.

## Database Schema

```sql
-- Boards
CREATE TABLE boards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled Board',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Board Objects (sticky notes, shapes, frames, connectors, text)
CREATE TABLE board_objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- 'sticky_note', 'rectangle', 'circle', 'line', 'frame', 'connector', 'text'
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 0,
  width FLOAT DEFAULT 150,
  height FLOAT DEFAULT 150,
  rotation FLOAT DEFAULT 0,
  z_index INTEGER DEFAULT 0,
  properties JSONB DEFAULT '{}', -- color, text, fontSize, fromId, toId, etc.
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_board_objects_board_id ON board_objects(board_id);

-- Enable RLS
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_objects ENABLE ROW LEVEL SECURITY;

-- RLS Policies (permissive for MVP: any authenticated user can access any board)
CREATE POLICY "Authenticated users can read boards" ON boards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create boards" ON boards FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can read board objects" ON board_objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert board objects" ON board_objects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update board objects" ON board_objects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete board objects" ON board_objects FOR DELETE TO authenticated USING (true);
```

## File Structure

```
collabboard/
  app/
    layout.tsx            — Root layout, Supabase provider
    page.tsx              — Landing/dashboard (list boards, create board)
    (auth)/
      login/page.tsx      — Login page
      callback/route.ts   — OAuth callback handler
    board/[id]/
      page.tsx            — Main board page (client component)
    api/
      ai-command/route.ts — AI agent endpoint
  components/
    canvas/
      Board.tsx           — Main Konva Stage with pan/zoom
      StickyNote.tsx      — Sticky note Konva component
      Shape.tsx           — Rectangle/circle Konva component
      Connector.tsx       — Line/arrow connector
      Frame.tsx           — Frame/group component
      TextElement.tsx     — Standalone text
      Toolbar.tsx         — Creation tools toolbar
      SelectionManager.tsx — Multi-select logic
    collaboration/
      Cursors.tsx         — Render other users' cursors
      PresenceBar.tsx     — Who's online indicator
      AiChat.tsx          — AI command input
    ui/
      — Shared UI components (buttons, modals, inputs)
  lib/
    supabase/
      client.ts           — Browser Supabase client
      server.ts           — Server Supabase client
      middleware.ts        — Auth middleware
    ai/
      tools.ts            — Tool definitions for Claude function calling
      agent.ts            — AI agent orchestration
    hooks/
      useBoard.ts         — Board state + realtime subscriptions
      usePresence.ts      — Cursor broadcast + presence
      useCanvas.ts        — Pan/zoom/selection state
  types/
    board.ts              — TypeScript types for board objects
    supabase.ts           — Generated Supabase types
  supabase/
    migrations/           — SQL migrations
```

## MVP Requirements (HARD GATE — 24 hours) ✅ PASSED

All items verified and working on deployed URL.

- [x] Infinite board with pan/zoom
- [x] Sticky notes with editable text
- [x] At least one shape type (rectangle)
- [x] Create, move, and edit objects
- [x] Real-time sync between 2+ users
- [x] Multiplayer cursors with name labels
- [x] Presence awareness (who's online)
- [x] User authentication (email/password)
- [x] Deployed and publicly accessible

## Build Order (FOLLOW THIS EXACTLY)

### ═══ MVP SCOPE (Phases 1-4) — ✅ COMPLETE, MVP SUBMITTED ═══

### Phase 1: Foundation (Hours 0-3)
1. ~~`npx create-next-app` — ALREADY DONE~~
2. ~~Install deps — ALREADY DONE~~
3. ~~Set up Supabase project — ALREADY DONE~~
4. ~~Run migrations — ALREADY DONE~~
5. Set up Supabase Auth (email/password — already enabled by default in Supabase)
6. Create auth pages (login, signup, callback)
7. Add Supabase middleware for session management
8. Create dashboard page (list boards, create new board)
9. Verify: can sign up, log in, create a board, and navigate to /board/[id]

### Phase 2: Canvas Basics (Hours 3-6)
1. Create the Board component with Konva Stage
2. Implement infinite canvas (pan with drag, zoom with scroll wheel)
3. Create StickyNote component (draggable, editable text, color)
4. Create Rectangle shape component (draggable, resizable)
5. Add a toolbar for creating objects
6. Wire up to Supabase: save objects on creation/edit, load on page mount
7. Verify: can create sticky notes and shapes, refresh page, they persist

### Phase 3: Multiplayer (Hours 6-14) — THE HARDEST PART
1. Set up Supabase Realtime subscription on `board_objects` table
2. When any row changes, update local state for all connected clients
3. Handle INSERT (new object appears), UPDATE (object moves/edits), DELETE
4. Set up Supabase Broadcast channel for cursor positions
5. Throttle cursor position broadcasts to every 50ms
6. Render other users' cursors with name labels
7. Implement presence tracking (join/leave events on the Broadcast channel)
8. Build PresenceBar showing online users
9. Test extensively: 2+ browser windows, simultaneous edits, refresh mid-edit
10. Handle disconnect/reconnect gracefully

### Phase 4: Deploy + MVP Verification (Hours 14-16)
1. Push to GitHub
2. Deploy to Vercel (connect repo)
3. Set environment variables (Supabase URL, anon key, service role key)
4. Configure auth redirect URLs for production domain
5. **MVP CHECKLIST — ✅ ALL VERIFIED ON DEPLOYED URL:**
   - [x] Infinite board with pan/zoom
   - [x] Sticky notes with editable text
   - [x] At least one shape type (rectangle)
   - [x] Create, move, and edit objects
   - [x] Real-time sync between 2+ users (test in 2 browsers)
   - [x] Multiplayer cursors with name labels
   - [x] Presence awareness (who's online)
   - [x] User authentication (signup + login + logout)
   - [x] Deployed and publicly accessible at collabboard-black.vercel.app
6. ~~STOP. Submit MVP.~~ ✅ MVP submitted.

### ═══ POST-MVP (Phases 5-8) — MVP submitted, 79 hours remain ═══

### Phase 5: Extended Board Features ✅ COMPLETE
Priority: High — these are in the grading rubric

### Phase 6: AI Agent ✅ COMPLETE
Priority: High — required for submission, 6+ command types across 4 categories

### Phase 7: Remaining Hard Requirements
Priority: CRITICAL — these are graded and not yet done

1. **Disconnect/reconnect handling:** Detect lost WebSocket, show "Reconnecting..." indicator, auto-rejoin Broadcast channel on reconnect. Test by disabling network in DevTools briefly, then re-enabling.
2. **Document conflict resolution approach:** Add a visible note somewhere in the app or README explaining our last-write-wins strategy for simultaneous edits. The spec says "last-write-wins acceptable, document your approach."
3. **GitHub README:** Must include: setup guide (clone, install, env vars, run), architecture overview (stack, sync approach, AI agent design), deployed link (collabboard-black.vercel.app), screenshots of the board in action.
4. **Verify and harden AI commands:** Test these specific commands and fix if they don't produce good results:
   - Layout: "Arrange these sticky notes in a grid" / "Space these elements evenly"
   - Complex: "Create a SWOT analysis template with four quadrants"
   - Complex: "Build a user journey map with 5 stages"
   - Complex: "Set up a retrospective board with What Went Well, What Didn't, and Action Items"
   - If any of these fail or produce poor layouts, improve the system prompt or tool definitions
5. **Push to Vercel and verify:** All changes must be deployed and working on production URL

### Phase 8: Testing & Verification
Priority: HIGH — evaluators will run these exact scenarios

Run and document results for ALL of these:

**Spec Testing Scenarios (evaluators will use these):**
1. 2 users editing simultaneously in different browsers
2. One user refreshing mid-edit (state persistence check)
3. Rapid creation and movement of sticky notes and shapes (sync performance)
4. Network throttling and disconnection recovery (Chrome DevTools → Network → Slow 3G)
5. 5+ concurrent users without degradation (open 5+ browser tabs/windows)

**AI Agent Testing:**
6. Test all 4 command categories (creation, manipulation, layout, complex)
7. Measure response latency — must be <2s for single-step commands
8. Two users issuing AI commands simultaneously
9. Verify AI-created objects appear for all connected users

**Performance Spot-Checks:**
10. 60 FPS during pan/zoom (Chrome DevTools Performance tab)
11. Create 50+ objects rapidly — does sync hold up?

Fix any failures found during testing before moving on.

### Phase 9: Polish (time permitting)
Priority: Medium — improves grade but not required

1. Fix hydration warnings from Phase 1
2. Transform handles only visible on selected objects
3. Next.js middleware → proxy rename (deprecation warning)

### Phase 10: Submission Deliverables (Alan does these, Claude Code helps with README)
Priority: CRITICAL — required for submission by Sunday 10:59 PM CT

1. ✅ GitHub README — created in Phase 7 by Claude Code
2. **Demo Video (3-5 min) — Alan records:** Show real-time collab between 2+ users, AI commands, explain architecture. Use Loom or similar.
3. **AI Development Log (1 page) — Alan writes with Claude help:**
   - Tools & Workflow (Claude Code + claude.ai, dual-window workflow)
   - MCP Usage (if any)
   - 3-5 effective prompts (include actual prompts)
   - Code analysis (rough % AI-generated vs hand-written)
   - Strengths & limitations (Realtime debugging was hard for AI, canvas code was easy)
   - Key learnings
4. **AI Cost Analysis — Alan writes with Claude help:**
   - Development costs: Anthropic API spend, Claude Max subscription, tokens consumed
   - Production projections at 100 / 1,000 / 10,000 / 100,000 users/month
   - Assumptions documented
5. **Social Post — Alan publishes:** X or LinkedIn, description + features + demo/screenshots, tag @GauntletAI
6. **Final deploy:** Push everything, verify production URL one last time

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS during pan/zoom |
| Object sync | <100ms latency |
| Cursor sync | <50ms latency |
| Object capacity | 500+ objects |
| Concurrent users | 5+ without degradation |

## Key Patterns

### IMPORTANT: Actual sync architecture (differs from original plan)
We use **Broadcast for ALL sync** — both objects and cursors. postgres_changes had issues with
Supabase Realtime filtering. The working pattern is:

- **Object CRUD:** Write to DB → Broadcast the change → other clients apply it
- **Cursor sync:** Broadcast only (ephemeral, no DB)
- **Presence:** Supabase Presence API on the Broadcast channel
- **Channel config:** `{ broadcast: { self: false } }` so sender doesn't receive own events
- **StrictMode handling:** Deferred cleanup pattern (200ms setTimeout) to survive React 18 double-invoke

### Supabase Broadcast (object + cursor sync)
```typescript
const channel = supabase.channel(`board-${boardId}`, {
  config: { broadcast: { self: false } }
})
channel
  .on('broadcast', { event: 'object-create' }, ({ payload }) => { /* add to state */ })
  .on('broadcast', { event: 'object-update' }, ({ payload }) => { /* update state */ })
  .on('broadcast', { event: 'object-delete' }, ({ payload }) => { /* remove from state */ })
  .on('broadcast', { event: 'object-move' }, ({ payload }) => { /* live drag position */ })
  .on('broadcast', { event: 'cursor' }, ({ payload }) => { /* update cursor */ })
  .on('presence', { event: 'sync' }, () => { /* update online users */ })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id, name, color })
    }
  })
```

## Lessons Learned During MVP (read before making changes)

1. **postgres_changes doesn't work reliably** with our Supabase setup. We tried REPLICA IDENTITY FULL, verified the publication, tested both key formats — channels never received events. **Use Broadcast for all sync.** DB writes still happen for persistence, but real-time delivery goes through Broadcast.

2. **React 18 Strict Mode double-invokes effects** in development. This kills WebSocket connections before they establish. The fix is a deferred cleanup pattern: schedule cleanup with setTimeout(200ms), cancel it if the effect remounts. Both useBoard and usePresence use this pattern — **do not remove it.**

3. **Konva intercepts pointer events** on its canvas. To get continuous cursor tracking (not just on click), use `window.addEventListener('pointermove')` with bounds checking, not React onMouseMove or Konva onPointerMove.

4. **z_index overflow:** Don't use `Date.now()` for z_index — it exceeds PostgreSQL INTEGER max. Use an incrementing counter based on max existing z_index.

5. **Konva drag vs click:** Set `dragDistance={5}` on draggable components so double-clicks with slight jitter aren't swallowed as drag starts.

6. **Supabase auth email rate limits:** Email confirmation is disabled (Supabase free tier limits to ~3-4 confirmation emails/hour). Users sign up and are immediately active.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## Commands

```bash
npm run dev          # Start dev server
npx supabase start   # Start local Supabase (optional)
npx supabase gen types typescript --project-id <id> > types/supabase.ts
```