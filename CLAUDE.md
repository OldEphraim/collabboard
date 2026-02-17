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

## MVP Requirements (HARD GATE — 24 hours)

ALL of these must work or the project fails. See Phase 4 checklist for verification.

- [ ] Infinite board with pan/zoom
- [ ] Sticky notes with editable text
- [ ] At least one shape type (rectangle)
- [ ] Create, move, and edit objects
- [ ] Real-time sync between 2+ users
- [ ] Multiplayer cursors with name labels
- [ ] Presence awareness (who's online)
- [ ] User authentication (email/password)
- [ ] Deployed and publicly accessible

**A simple whiteboard with bulletproof multiplayer beats a feature-rich board with broken sync.**

## Build Order (FOLLOW THIS EXACTLY)

### ═══ MVP SCOPE (Phases 1-4) — SUBMIT BEFORE MOVING ON ═══

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
5. **MVP CHECKLIST — verify ALL of these on the deployed URL:**
   - [ ] Infinite board with pan/zoom
   - [ ] Sticky notes with editable text
   - [ ] At least one shape type (rectangle)
   - [ ] Create, move, and edit objects
   - [ ] Real-time sync between 2+ users (test in 2 browsers)
   - [ ] Multiplayer cursors with name labels
   - [ ] Presence awareness (who's online)
   - [ ] User authentication (signup + login)
   - [ ] Deployed and publicly accessible
6. **STOP. Submit MVP. Then continue to Phase 5.**

### ═══ POST-MVP (Phase 5+) — only after MVP is submitted ═══

### Phase 5: AI Agent (Hours 16-24)
1. Define tool schemas in `lib/ai/tools.ts`
2. Build `/api/ai-command` route: receives text, calls Anthropic with tools, executes results
3. Implement tools: createStickyNote, createShape, moveObject, updateText, changeColor, getBoardState
4. Build AiChat component (text input + response display)
5. Test: "Create a yellow sticky note that says Hello" → sticky note appears for all users
6. Add complex commands: "Create a SWOT analysis" (multi-step)

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS during pan/zoom |
| Object sync | <100ms latency |
| Cursor sync | <50ms latency |
| Object capacity | 500+ objects |
| Concurrent users | 5+ without degradation |

## Key Patterns

### Supabase Realtime subscription (object sync)
```typescript
supabase
  .channel('board-objects')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'board_objects',
    filter: `board_id=eq.${boardId}`
  }, (payload) => {
    // Handle INSERT, UPDATE, DELETE
  })
  .subscribe()
```

### Supabase Broadcast (cursor sync)
```typescript
const channel = supabase.channel(`board-${boardId}`)
channel
  .on('broadcast', { event: 'cursor' }, ({ payload }) => {
    // Update other user's cursor position
  })
  .on('presence', { event: 'sync' }, () => {
    // Update online users list
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id, name, color })
    }
  })

// Send cursor position (throttled)
channel.send({ type: 'broadcast', event: 'cursor', payload: { x, y, user_id, name } })
```

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