# CollabBoard Architecture

A production-scale real-time collaborative whiteboard with AI-powered board manipulation, built in one week for the Gauntlet AI program.

**Deployed at:** collabboard-black.vercel.app

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Database Design](#database-design)
4. [Authentication & Middleware](#authentication--middleware)
5. [Real-Time Sync Architecture](#real-time-sync-architecture)
6. [Canvas Rendering Engine](#canvas-rendering-engine)
7. [Multi-Select & Multi-Drag System](#multi-select--multi-drag-system)
8. [AI Agent Architecture](#ai-agent-architecture)
9. [Accessibility Architecture](#accessibility-architecture)
10. [State Management](#state-management)
11. [Component Architecture](#component-architecture)
12. [Performance Engineering](#performance-engineering)
13. [Deployment & Infrastructure](#deployment--infrastructure)
14. [Interview Q&A](#interview-qa)

---

## System Overview

CollabBoard is a Miro-like collaborative whiteboard where multiple users simultaneously create, edit, and arrange objects on an infinite canvas. An AI agent accepts natural language commands and manipulates the board through function calling.

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Client                        │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐    │
│  │ Konva.js │  │ Supabase   │  │ React (Next.js)  │    │
│  │ Canvas   │  │ Broadcast  │  │ App Router       │    │
│  └────┬─────┘  └──────┬─────┘  └────────┬─────────┘    │
│       │               │                  │               │
│       ▼               ▼                  ▼               │
│  ┌─────────────────────────────────────────────────┐    │
│  │         BoardWrapper (orchestrator)              │    │
│  │  useBoard() ←→ Broadcast Channel (objects)      │    │
│  │  usePresence() ←→ Broadcast Channel (cursors)   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────┘
                      │  HTTP / WebSocket
                      ▼
┌─────────────────────────────────────────────────────────┐
│                     Server                               │
│  ┌──────────────────┐    ┌────────────────────────┐     │
│  │ /api/ai-command   │    │ Supabase (PostgreSQL)  │     │
│  │ Claude Haiku 4.5  │───▶│ boards, board_objects  │     │
│  │ Function Calling   │    │ RLS policies           │     │
│  └──────────────────┘    └────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

**Data flows:**
1. **Object CRUD:** Client writes to DB → broadcasts change → other clients apply it
2. **Cursor sync:** Client broadcasts position → other clients render cursor (no DB write)
3. **AI commands:** Client → POST /api/ai-command → Claude function calling → DB writes → results returned → client broadcasts to peers
4. **Auth:** Supabase Auth via cookies, enforced by middleware on every route

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 16 (App Router) | Server components for auth pages, client components for canvas. Vercel-native deployment. |
| **Canvas** | react-konva (Konva.js 10.2) | Declarative React API over HTML5 Canvas. Built-in drag, resize, transform. Handles 500+ objects. |
| **Database** | PostgreSQL via Supabase | Relational model for board objects. JSONB column for polymorphic properties. Free tier. |
| **Real-time** | Supabase Broadcast + Presence | Managed WebSocket channels. Broadcast for ephemeral events (cursors, drags). Presence for online users. |
| **Auth** | Supabase Auth (email/password) | Session cookies, integrated with RLS. No email confirmation (free tier rate limits). |
| **AI** | Anthropic Claude Haiku 4.5, function calling | 11 tools for CRUD + inspection. Agentic loop with early-return optimization. |
| **Styling** | Tailwind CSS 4 | Utility-first CSS, high-contrast mode via conditional classes. |
| **Testing** | Playwright 1.58 | 16 E2E tests covering sync, performance, AI, and concurrency. |

---

## Database Design

Two tables, deliberately minimal for a one-week sprint:

### `boards`

```sql
CREATE TABLE boards (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'Untitled Board',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `board_objects`

```sql
CREATE TABLE board_objects (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id   UUID REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  type       TEXT NOT NULL,  -- 7 types: sticky_note, rectangle, circle, line, frame, connector, text
  x          FLOAT NOT NULL DEFAULT 0,
  y          FLOAT NOT NULL DEFAULT 0,
  width      FLOAT DEFAULT 150,
  height     FLOAT DEFAULT 150,
  rotation   FLOAT DEFAULT 0,
  z_index    INTEGER DEFAULT 0,
  properties JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Design decisions

**Single table for all object types.** A `type` column plus a JSONB `properties` column. Each type stores different fields in `properties`:

| Type | Properties |
|------|-----------|
| `sticky_note` | `{text, color, fontSize}` |
| `rectangle`, `circle` | `{fill, stroke, strokeWidth}` |
| `line` | `{stroke, strokeWidth, points: [x0, y0, x1, y1]}` |
| `frame` | `{title, fill, stroke, strokeWidth, locked}` |
| `connector` | `{fromId, toId, stroke, strokeWidth}` |
| `text` | `{text, fontSize, fontFamily, fill}` |

This avoids 7 separate tables while keeping queries simple (`SELECT * FROM board_objects WHERE board_id = ?`). The JSONB column is never queried by its fields — it's always loaded whole and parsed client-side.

**RLS policies (permissive for MVP):** Any authenticated user can read/write any board. No multi-tenant row filtering. This is documented as a known scope limitation — production would add board membership.

**z_index as INTEGER, not timestamp.** Early implementation used `Date.now()` which overflows PostgreSQL INTEGER. We use a client-side counter that increments from the max existing z_index.

---

## Authentication & Middleware

### Flow

```
User visits /board/abc
  → middleware.ts runs
  → updateSession() checks cookies for Supabase session
  → If no session → redirect to /login
  → If session valid → proceed to page
  → Server component fetches board from DB
  → Renders BoardLoader (dynamic import, ssr: false)
  → Client-side BoardWrapper mounts with userId, userEmail
```

### Key files

- **`middleware.ts`** — Runs on every non-static route. Calls `updateSession()` from `lib/supabase/middleware.ts`.
- **`lib/supabase/middleware.ts`** — Creates a server Supabase client using cookies. Calls `getUser()` to validate. Redirects unauthenticated users to `/login`, authenticated users away from `/login`.
- **`lib/supabase/server.ts`** — Server-side Supabase client (used in server components and API routes). Manages cookies via Next.js `cookies()` API.
- **`lib/supabase/client.ts`** — Browser-side Supabase client (used in hooks). Created once per hook via `useRef`.
- **`app/(auth)/login/page.tsx`** — Client component. Dual-mode sign up / sign in. Calls `supabase.auth.signUp()` or `signInWithPassword()`.
- **`app/(auth)/callback/route.ts`** — Exchanges OAuth `code` for session via `exchangeCodeForSession()`.

### Why no SSR for the board page

The board page uses `dynamic(() => import('./BoardWrapper'), { ssr: false })`. Konva.js requires the DOM (it creates `<canvas>` elements), so the entire board UI is client-rendered. Auth is still validated server-side — the server component checks the session and passes `userId`/`userEmail` as props.

---

## Real-Time Sync Architecture

This is the most architecturally significant part of the system. We use a **dual-layer approach** — not the one originally planned.

### What we tried first (and why it failed)

The original plan used **Supabase Realtime postgres_changes** — listening to INSERT/UPDATE/DELETE on the `board_objects` table. Despite enabling REPLICA IDENTITY FULL, configuring the publication, and testing both key formats, events were never delivered. This is documented as a known Supabase limitation in certain configurations.

### What we built instead: Broadcast-based sync

Two Supabase Broadcast channels per board:

```
board-objects-{boardId}     — object CRUD + live drag positions
board-presence-{boardId}    — cursor positions + presence tracking
```

Both channels use `config: { broadcast: { self: false } }` so the sender never receives its own events.

### Sync protocol

**Write path (create/update/delete):**
```
1. Optimistic local state update (immediate UI feedback)
2. Broadcast event to other clients via channel.send()
3. Persist to database via Supabase insert/update/delete
```

The broadcast happens *before* the DB write completes. This means other clients see the change in ~50-100ms even if the DB write takes longer. If the DB write fails, we log the error but don't roll back (acceptable for MVP — last-write-wins).

**Read path (receiving updates from others):**
```
1. Broadcast event received via channel.on('broadcast', ...)
2. Update local state via setObjects()
3. React re-renders the affected Konva components
```

**Drag path (live movement):**
```
1. Konva onDragMove fires
2. Throttled to 50ms: broadcastObjectMove(id, x, y)
3. Other clients receive 'object-move' event, update local state
4. On dragEnd: full update (persist to DB + broadcast 'object-update')
```

The drag path uses a separate `object-move` event that is ephemeral — it updates positions visually but doesn't persist. Only the final `object-update` on drag-end writes to the database.

### Reconnection handling

```typescript
channel.subscribe(async (status) => {
  if (status === 'SUBSCRIBED') {
    setConnected(true)
    if (hasBeenConnected.current) {
      // Reconnect — reload all objects from DB to catch missed changes
      const { data } = await supabase.from('board_objects').select('*')...
      setObjects(data)
    }
    hasBeenConnected.current = true
  }
})
```

On reconnect, we reload the full board state from the database. This catches any changes that were broadcast while we were disconnected. A `ConnectionStatus` component shows a "Reconnecting..." banner when either channel disconnects.

### Conflict resolution: last-write-wins

When two users edit the same object simultaneously, both writes go to the database. The last write wins. Both clients receive each other's broadcast and converge. This is documented in the UI via an info tooltip in the board header.

### React 18 StrictMode survival

In development, React 18 double-invokes effects. This kills WebSocket connections before they establish. Both `useBoard` and `usePresence` use a **deferred cleanup** pattern:

```typescript
useEffect(() => {
  // Cancel pending cleanup from previous StrictMode unmount
  if (cleanupTimerRef.current) {
    clearTimeout(cleanupTimerRef.current)
  }
  // ... setup channel ...
  return () => {
    // Don't clean up immediately — wait 200ms
    cleanupTimerRef.current = setTimeout(() => {
      supabase.removeChannel(channel)
    }, 200)
  }
}, [deps])
```

If the effect re-runs within 200ms (StrictMode), it cancels the pending cleanup and reuses the existing channel. In production (no StrictMode), the 200ms delay has no impact.

---

## Canvas Rendering Engine

### Component hierarchy

```
BoardWrapper (state orchestrator)
  └── BoardCanvas (Konva Stage + Layer)
        ├── FrameComponent[]    (z-order: 0 — background)
        ├── Connector[]         (z-order: 1 — arrows between objects)
        ├── StickyNote[]        (z-order: 2 — with z_index sub-sorting)
        ├── Shape[]             (z-order: 2)
        ├── CircleShape[]       (z-order: 2)
        ├── LineShape[]         (z-order: 2)
        ├── TextElement[]       (z-order: 2)
        ├── Rect (focus ring)   (non-interactive overlay)
        └── Rect (selection)    (drag-to-select rectangle)
```

### Object rendering

Objects are sorted: frames first (background), then connectors (arrows), then everything else sorted by `z_index`. Each type has its own React component wrapping Konva primitives:

- **StickyNote** — `<Group>` with shadow `<Rect>`, background `<Rect>`, `<Text>`. Double-click triggers an HTML `<textarea>` overlay for editing.
- **Shape** — `<Rect>` with `<Transformer>` for resize/rotate when selected.
- **CircleShape** — `<Circle>` with `<Transformer>` (keepRatio, corner anchors only).
- **LineShape** — `<Group>` with `<Line>` and draggable endpoint `<Circle>` handles when selected.
- **TextElement** — `<Text>` with `<Transformer>` (horizontal resize only). Double-click for editing.
- **Frame** — `<Group>` with title bar `<Rect>` + body `<Rect>`. Transformer for resize. `locked` property controls child binding.
- **Connector** — `<Arrow>` computed from source/target object centers. Returns null if either endpoint is missing.

### Text editing pattern

Konva doesn't have native text editing. We overlay an HTML `<textarea>` on top of the canvas, positioned using `stage.getAbsoluteTransform().point()` to convert canvas coordinates to screen coordinates. The textarea matches the object's size, font, and color, scaled by the current zoom level. On blur, the text is persisted and the textarea is removed.

### Pan and zoom

- **Pan:** The Konva Stage is `draggable`. Dragging empty canvas pans the view.
- **Zoom:** `onWheel` adjusts `stage.scale()` and repositions the stage so the zoom centers on the cursor. Clamped to 0.1x – 5x.
- **Shift held:** Stage becomes non-draggable, enabling drag-to-select rectangle.

---

## Multi-Select & Multi-Drag System

### Selection modes

1. **Click** — selects one object (deselects others)
2. **Shift+click** — toggles object in/out of multi-selection
3. **Shift+drag** — drag-to-select rectangle; selects all objects whose bounds intersect the rectangle

### Multi-drag algorithm

When a user drags one object while multiple are selected, all selected objects move together maintaining their relative positions. This uses **direct Konva node manipulation** instead of React state updates for performance:

```
1. On first drag-move event:
   a. Snapshot start positions of all selected objects
   b. If dragged object is a locked frame, collect all contained objects too
   c. Store in multiDragRef: { draggedId, startPositions: Map<id, {x,y}> }

2. On subsequent drag-move events:
   a. Calculate delta: dx = newX - startX, dy = newY - startY
   b. For each sibling object:
      - stage.findOne('.' + id).position({ x: startX + dx, y: startY + dy })
   c. This moves Konva nodes directly without React re-render

3. On drag-end:
   a. Persist all final positions to DB via onUpdate()
   b. Broadcast all position changes
   c. Clear multiDragRef
```

This avoids N React re-renders per drag frame (where N is the number of selected objects). Instead, Konva nodes are moved directly via `node.position()`, and React state is only updated on drag-end.

### Locked frames

Frames have a `locked` boolean property. When locked, dragging the frame also drags all objects whose center is inside the frame's bounds. This is computed recursively — a locked frame inside a locked frame moves all nested contents.

```typescript
function collectLockedFrameContents(frame, allObjects, collected) {
  for (const obj of allObjects) {
    if (isInsideFrame(obj, frame)) {
      collected.set(obj.id, { x: obj.x, y: obj.y })
      // Recurse into nested locked frames
      if (obj.type === 'frame' && obj.properties.locked) {
        collectLockedFrameContents(obj, allObjects, collected)
      }
    }
  }
}
```

---

## AI Agent Architecture

### Endpoint: POST /api/ai-command

The AI agent lives entirely in a single API route (`app/api/ai-command/route.ts`). It uses Claude Haiku 4.5 with function calling in an agentic loop.

### Request/Response

```json
// Request
{ "text": "Create a SWOT analysis", "boardId": "uuid" }

// Response
{
  "message": "Created 4 objects.",
  "results": [
    { "action": "create", "object": { ...BoardObject } },
    ...
  ]
}
```

### Tool definitions (11 tools)

**Creation (5):** `create_sticky_note`, `create_shape`, `create_text`, `create_frame`, `create_connector`
**Manipulation (5):** `move_object`, `resize_object`, `update_text`, `change_color`, `delete_object`
**Inspection (1):** `get_board_state` — returns current objects as JSON for the model to reason about

### Agentic loop with early-return optimization

```
1. Classify command as "simple" or "complex" via regex
   (SWOT, journey, retrospective, kanban, arrange → complex)

2. Build system prompt:
   - Base: coordinate system, object sizes, spacing guidelines
   - If complex: append TEMPLATE_RECIPES with exact layouts
   - Append: current board state (all objects with positions)

3. Call Claude with tools + messages

4. While response.stop_reason === 'tool_use' (max 10 iterations):
   a. Execute each tool call against Supabase
   b. Collect results
   c. Early return check:
      - If NOT complex AND no errors AND has results AND didn't call get_board_state
      - → Skip final Claude call, auto-summarize results
   d. Otherwise: send tool results back to Claude, continue loop

5. Return message + results array
```

The **early-return optimization** is critical for latency. Simple commands like "create a yellow sticky note" only need one tool call. Without early return, we'd make a second Claude API call just to get a summary text. With early return, we auto-generate the summary and skip the round-trip, saving ~500ms.

### Template recipes

For complex commands (SWOT, user journey, retrospective), the system prompt includes exact coordinate layouts:

```
SWOT Analysis:
- 4 frames in 2x2 grid: Strengths (50,50), Weaknesses (520,50),
  Opportunities (50,420), Threats (520,420), each 450x350
- 2-3 sticky notes per frame with appropriate colors
```

This gives the model exact coordinates so it doesn't have to calculate layouts, improving reliability.

### Server-side tool execution

Each tool call writes directly to the database via the server-side Supabase client (using `SUPABASE_SERVICE_ROLE_KEY` via session auth). The AI endpoint also broadcasts changes so other connected clients see them. The client that sent the AI command receives results in the HTTP response and calls `applyAiResults()` which updates local state and broadcasts to peers.

---

## Accessibility Architecture

### Colorblind-safe palette (`lib/colors.ts`)

All palettes are centralized in one file. The old red/green colors were replaced with blue/orange as the primary contrast pair (based on IBM Design and Wong colorblind-safe research). All color pickers show text labels alongside swatches.

### High-contrast mode (`HighContrastContext`)

A React context provides a boolean to all components. The toggle is in the board header, persisted to localStorage. When enabled:
- Canvas background: white instead of light gray
- Sticky notes: black 2-3px borders, black text
- Shapes/circles: minimum 3px stroke width
- Frames: solid borders (no dashes), 2px width
- Connectors: black 3px strokes
- UI panels: extra-thick dark borders

### Keyboard navigation

The canvas container has `tabIndex={0}` and `role="application"`. Keyboard shortcuts:

| Key | Action |
|-----|--------|
| Tab / Shift+Tab | Cycle through objects (z-index order, skip connectors) |
| Arrow keys | Move selected object 5px (20px with Shift) |
| Enter | Start editing text on focused sticky note or text element |
| Delete / Backspace | Delete selected objects |
| Escape | Deselect all, clear focus |
| Ctrl+A | Select all non-connector objects |
| Ctrl+C / Ctrl+V | Copy / paste via sessionStorage |
| Ctrl+D | Duplicate selected objects |

A dashed blue `<Rect>` renders around the focused object on the Konva layer (`listening={false}` so it doesn't intercept events).

### Screen reader announcements (`AriaLiveAnnouncer`)

A context provider renders a visually-hidden `aria-live="polite"` region. The `useAnnounce()` hook returns an `announce(message)` function used throughout:
- "[User] joined/left the board" (presence changes)
- "Sticky note created", "Rectangle created", etc. (object creation)
- "3 objects deleted" (deletion)
- "AI created 4 objects" (AI results)

### ARIA landmarks

| Element | Role | Purpose |
|---------|------|---------|
| Canvas container | `application` | Signals that custom keyboard handling is active |
| Creation toolbar | `toolbar` | Groups related tool buttons |
| Selection actions | `toolbar` | Groups selection operation buttons |
| AI chat messages | `log` | Auto-scrolling conversation history |
| Presence bar | `status` | Dynamic "N users online" |
| Connection banner | `alert` | Critical reconnection notification |

---

## State Management

No external state library. All state lives in React hooks:

### `useBoard(boardId)` — Core multiplayer state

- `objects: BoardObject[]` — the source of truth for all canvas objects
- `loading: boolean` — true until initial DB load completes
- `connected: boolean` — Broadcast channel connection status
- Exposes: `createObject`, `updateObject`, `deleteObject`, `broadcastObjectMove`, `applyAiResults`
- Manages: Supabase Broadcast channel lifecycle, z_index counter, reconnection reloads

### `usePresence(boardId, userId, userName)` — Cursor + presence

- `cursors: Map<userId, CursorPosition>` — other users' cursor positions
- `onlineUsers: PresenceUser[]` — all users currently on the board
- `connected: boolean` — Presence channel status
- Exposes: `broadcastCursor(x, y)`, `userColor`

### Local component state

- `selectedIds: Set<string>` — multi-selection (in Board.tsx)
- `focusedObjectId: string | null` — keyboard focus (in Board.tsx)
- `connectingFrom: string | null` — connector mode (in BoardWrapper.tsx)
- `highContrast: boolean` — accessibility toggle (in BoardWrapper.tsx)
- `isEditing: boolean` — text editing mode (in StickyNote.tsx, TextElement.tsx)

### Why no Redux/Zustand

The object list is a flat array with simple CRUD operations. React's built-in `useState` + `useCallback` handles this efficiently. The broadcast channel acts as the "action dispatcher" for cross-client sync. Adding a state management library would add complexity without solving any problem we actually have.

---

## Component Architecture

### File structure

```
components/
  canvas/
    BoardWrapper.tsx     — Orchestrator: wires hooks to UI, provides contexts
    Board.tsx            — Konva Stage + Layer, selection, keyboard nav
    StickyNote.tsx       — Editable sticky note with color
    Shape.tsx            — Rectangle with transform
    CircleShape.tsx      — Circle with transform
    LineShape.tsx        — Line with draggable endpoints
    Connector.tsx        — Arrow between two objects
    Frame.tsx            — Container/grouping box with lock
    TextElement.tsx      — Standalone text with transform
    Toolbar.tsx          — Creation tool buttons
    SelectionActions.tsx — Color/duplicate/delete for selected objects
  collaboration/
    Cursors.tsx          — Renders other users' cursor SVGs
    PresenceBar.tsx      — Online users indicator
    AiChat.tsx           — Floating AI assistant panel
    ConnectionStatus.tsx — Reconnecting banner
  ui/
    AriaLiveAnnouncer.tsx — Screen reader announcement provider
    Dashboard.tsx        — Board listing page
```

### Component responsibilities

**BoardWrapper** is the orchestrator. It:
- Initializes both hooks (`useBoard`, `usePresence`)
- Defines all creation handlers (sticky note, rectangle, etc.)
- Manages connector mode state
- Manages high-contrast state + context provider
- Wraps everything in `AriaLiveAnnouncerProvider`
- Announces presence changes and object creation/deletion

**BoardCanvas** is the rendering engine. It:
- Manages the Konva Stage (pan, zoom, resize)
- Handles all keyboard shortcuts
- Manages selection state (single, multi, drag-to-select)
- Coordinates multi-drag via direct Konva node manipulation
- Renders all object components, focus ring, selection rectangle

This separation means BoardWrapper knows nothing about Konva, and Board knows nothing about Supabase.

---

## Performance Engineering

### Targets (from spec)

| Metric | Target | Achieved |
|--------|--------|----------|
| Frame rate | 60 FPS during pan/zoom | Yes |
| Object sync | <100ms latency | Yes |
| Cursor sync | <50ms latency | Yes (50ms throttle) |
| Object capacity | 500+ objects | Yes |
| Concurrent users | 5+ without degradation | Yes |

### Key optimizations

1. **Direct Konva node manipulation for multi-drag.** Instead of updating React state for every dragged sibling on every frame, we move Konva nodes directly via `stage.findOne('.' + id).position()`. React state is only updated on drag-end.

2. **50ms throttle on cursor and drag broadcasts.** Without throttling, pointer events fire at 60+ Hz, generating thousands of WebSocket messages per second. Throttling to 50ms (20 Hz) reduces bandwidth by 3x while maintaining smooth visual feedback.

3. **Optimistic updates.** Local state changes immediately on every action. The broadcast and DB write happen asynchronously. Users see zero-latency feedback for their own actions.

4. **Early return in AI agentic loop.** Simple commands skip the final Claude API call and auto-generate a summary. Saves ~500ms per simple command.

5. **Deferred cleanup for StrictMode.** WebSocket channels aren't torn down immediately on unmount — a 200ms timer gives React StrictMode time to re-run the effect. This prevents the double-mount-unmount-mount pattern from killing live connections.

6. **ResizeObserver for responsive Stage.** The Konva Stage dimensions are set by a ResizeObserver on the container div, not by `window.innerWidth/Height`. This handles sidebar resizes and mobile rotation without layout thrashing.

7. **`dragDistance={5}` on all draggable objects.** Konva fires drag events on any mouse movement. Setting `dragDistance` to 5px means a slight jitter during double-click doesn't get swallowed as a drag start.

8. **Window-level pointermove for cursors.** Konva's own `onPointerMove` only fires when hovering over Konva shapes. To track the cursor everywhere on the canvas (including empty space), we use `window.addEventListener('pointermove')` with bounds checking.

---

## Deployment & Infrastructure

### Vercel

- Next.js auto-deployment from GitHub
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
- AI endpoint runs as a Serverless Function with `maxDuration = 30` seconds
- Middleware runs on the Edge for auth redirection

### Supabase

- PostgreSQL 15 (free tier)
- Realtime enabled for Broadcast and Presence channels
- RLS enabled on all tables (anon key is exposed client-side; RLS is the security boundary)
- Email confirmation disabled (free tier limits to ~3-4 confirmation emails/hour)

### Security model

The Supabase anon key is in client-side JavaScript — this is by design. Row-Level Security policies on every table ensure that even with the anon key, users can only access data they're authorized to see. For MVP, policies are permissive (any authenticated user can access any board). Production would add board membership checks.

---

## Interview Q&A

### 1. Why did you choose Supabase Broadcast over postgres_changes for real-time sync?

We initially tried `postgres_changes` — listening to INSERT/UPDATE/DELETE events on the `board_objects` table. Despite enabling REPLICA IDENTITY FULL, verifying the publication configuration, and testing both key formats, events were never delivered to connected clients. After extensive debugging, we determined this was an issue with our Supabase project's Realtime configuration rather than a code bug.

We pivoted to Broadcast, which is an ephemeral pub/sub layer that doesn't depend on database replication. The tradeoff is that we now handle two concerns separately: persistence (direct DB writes) and real-time delivery (Broadcast events). The benefit is rock-solid reliability — Broadcast events are delivered within ~50ms, and if a client misses events during a disconnect, we reload the full state from the database on reconnect. This dual-layer approach actually gives us more control than postgres_changes would have, since we can broadcast optimistically *before* the DB write completes.

### 2. How does your conflict resolution work when two users edit the same object simultaneously?

We use a last-write-wins strategy. When two users simultaneously modify the same object, both clients apply their changes optimistically to local state, broadcast the change, and write to the database. The last DB write wins — whichever `UPDATE` statement executes last overwrites the other. Both clients receive each other's broadcast events, so they converge to the same state within ~100ms. There's no operational transform, CRDT, or version vector.

This is explicitly documented in the application (via a tooltip in the board header) because the spec said "last-write-wins acceptable, document your approach." For a whiteboard where users typically work on different objects, conflicts are rare. When they do occur — say two users drag the same sticky note at the same time — the object snaps to the last position, which is a reasonable UX. A production system might add per-object version numbers and reject stale updates, but for MVP scope, last-write-wins is correct and simple.

### 3. Why did you use a single `board_objects` table with a JSONB `properties` column instead of separate tables per object type?

Seven separate tables (sticky_notes, rectangles, circles, etc.) would mean seven separate queries for initial load, seven separate Broadcast event types, and seven sets of CRUD functions. A single polymorphic table with a `type` discriminator and JSONB `properties` column keeps every operation simple: one SELECT to load the board, one broadcast channel for all changes, one set of CRUD hooks.

The JSONB column is never queried *by its fields* on the server side — we always load the full object and parse properties client-side with TypeScript interfaces (`StickyNoteProperties`, `ShapeProperties`, etc.). This means we don't lose query performance, and we gain schema flexibility — adding a new object type only requires a new TypeScript interface and a new Konva component, with zero database migrations. The tradeoff is that we can't enforce property-level constraints at the DB level, but TypeScript's type system catches these issues at compile time instead.

### 4. How does the multi-drag system work without causing performance issues?

The key insight is separating visual feedback from state persistence. During a multi-drag, we need to move N objects smoothly at 60 FPS. If we updated React state for each object on every drag frame, we'd trigger N re-renders per frame — a guaranteed performance cliff with more than a handful of objects.

Instead, we use **direct Konva node manipulation**. On the first drag-move event, we snapshot the start positions of all selected objects into a ref. On subsequent drag events, we calculate the delta from the primary object's movement and apply it directly to sibling Konva nodes via `stage.findOne('.' + id).position({ x, y })`. This bypasses React entirely — Konva updates the canvas in O(1) per node. Only on drag-end do we update React state and persist to the database. This gives us smooth 60 FPS multi-drag with zero React re-render overhead during the drag itself.

### 5. Explain the AI agentic loop and the early-return optimization.

The AI endpoint uses Claude's function calling in a loop. We send the user's command plus the current board state, and Claude responds with tool calls (create_sticky_note, move_object, etc.). We execute each tool, collect results, and if Claude's response `stop_reason` is still `tool_use`, we send the tool results back and let Claude make more calls. This loops up to 10 times, allowing complex commands like "create a SWOT analysis" to make 10+ tool calls across multiple turns.

The early-return optimization short-circuits this loop for simple commands. After executing tools in a given iteration, we check: is the command simple (not matching complex patterns like "SWOT" or "arrange")? Did all tools succeed? Did we get actual CRUD results? And did the model NOT call `get_board_state` (which signals it needs to inspect before acting further)? If all four conditions are true, we skip the final Claude API call and auto-generate a summary like "Created 1 object." This saves ~500ms of latency for the common case of "create a yellow sticky note" — the model makes one tool call, we execute it, and we immediately return without a second round-trip to the Anthropic API.

### 6. How do you handle React 18 StrictMode's double-invoke of effects with WebSocket connections?

In development, React 18 StrictMode simulates an unmount and remount of every component to help detect side-effect bugs. For components that establish WebSocket connections, this means: mount → connect → unmount (connection torn down) → remount → connect again. But the unmount's cleanup function runs *synchronously*, which can kill the channel before the second mount even starts.

We solve this with a **deferred cleanup** pattern. Instead of removing the Supabase channel immediately in the effect's cleanup function, we schedule removal via `setTimeout(200ms)`. If the effect re-runs within 200ms (as it does in StrictMode), the new invocation cancels the pending timeout and reuses the existing channel. In production, where StrictMode doesn't double-invoke, the cleanup runs normally after the 200ms delay. Both `useBoard` and `usePresence` use this pattern — it's critical infrastructure that should never be removed.

### 7. Why is the canvas not server-side rendered?

Konva.js creates HTML5 `<canvas>` elements and manipulates them via the Canvas 2D API. This requires the DOM and the `window` object, neither of which exist in a Node.js server environment. If we tried to render the board page on the server, the Konva import would fail with "window is not defined."

We handle this with Next.js dynamic imports: `dynamic(() => import('./BoardWrapper'), { ssr: false })`. The board page itself is a server component that validates auth and fetches the board metadata. It renders a `BoardLoader` component that dynamically imports the entire board UI client-side. This gives us the best of both worlds: server-side auth validation (so users can't access boards without logging in) and client-side canvas rendering (so Konva has the DOM it needs).

### 8. How does the cursor sync work, and why is it separate from object sync?

Cursor positions are ephemeral — they change 20+ times per second and have zero persistence value. If a user refreshes the page, we don't need to restore their last cursor position; we just start tracking fresh. This makes Broadcast (pub/sub, no DB) the perfect transport. Object changes, on the other hand, must be persisted so the board survives page refreshes.

We use a separate Broadcast channel for cursors (`board-presence-{boardId}`) to keep concerns isolated. The cursor channel uses Supabase's Presence API on top of Broadcast for online/offline tracking. Cursor positions are throttled to 50ms (20 updates per second) which is visually smooth while keeping bandwidth manageable. One implementation detail: Konva intercepts pointer events on its canvas, so to track cursors *everywhere* (including empty canvas space), we use `window.addEventListener('pointermove')` with bounds checking against the container's bounding rect, rather than Konva's own `onPointerMove`.

### 9. What's your approach to accessibility, and why did you prioritize it?

The developer is colorblind. The default Miro-like color palettes (red/green/yellow) are literally indistinguishable. This isn't a checkbox exercise — it's a personal usability requirement. We replaced all default palettes with a colorblind-safe set based on the IBM Design and Wong palettes, using blue/orange as the primary contrast pair. Every color picker shows text labels alongside swatches, so color is never the only means of distinguishing options.

Beyond color, we implemented high-contrast mode (thicker borders, black strokes, no dashed lines), full keyboard navigation (Tab to cycle objects, arrow keys to move, Enter to edit), and screen reader support (ARIA live regions that announce object creation, user joins/leaves, and AI results). The canvas container uses `role="application"` to signal custom keyboard handling, and all toolbar buttons have `aria-label` attributes. The high-contrast preference persists in localStorage. These features demonstrate technical depth while solving a real accessibility need.

### 10. How does the locked frame / grouping feature work architecturally?

A frame's `locked` property is a boolean in its JSONB properties. When a user clicks "Lock" in the selection actions bar, we set `properties.locked = true` on the frame object. The lock icon appears in the frame's title bar. When someone drags a locked frame, the `handleObjectDragMove` function in Board.tsx detects that the dragged object is a locked frame and calls `collectLockedFrameContents()`.

This function iterates over all board objects and checks which ones have their center point inside the frame's bounds using `isInsideFrame()`. It collects their current positions into a Map, and importantly, it recurses — if a nested frame is also locked, its contents are collected too. These collected objects become part of the multi-drag system: their Konva nodes are moved directly during the drag, and their final positions are persisted on drag-end. The frame doesn't literally "contain" objects in the data model — containment is computed geometrically at drag time. This means objects can be freely moved in and out of frames without any parent-child relationship bookkeeping.

### 11. How does the AI agent know the current state of the board?

The AI command endpoint receives a `boardId` and immediately queries the database for all `board_objects` on that board. This state is serialized into the system prompt as a formatted list: each object's type, ID, position, dimensions, and properties. This gives Claude full context about what's already on the board before it decides what tools to call.

For complex commands that need to inspect the board *during* execution (e.g., "arrange these objects in a grid" — Claude needs to see the current objects to calculate positions), the `get_board_state` tool re-queries the database and returns the latest state as a tool result. This is important because objects may have been created or moved by earlier tool calls in the same agentic loop. The presence of `get_board_state` in a tool call sequence is also the signal that prevents the early-return optimization from firing — if the model needs to inspect, it probably needs more turns to reason.

### 12. What would you change if you had to scale this to 10,000 concurrent users?

The current architecture has two scaling bottlenecks: the single Supabase Broadcast channel per board and the single PostgreSQL database. Broadcast channels have a practical limit of ~100 concurrent connections per channel. At 10,000 users, we'd need to shard channels — perhaps a hierarchical fan-out where regional relay servers aggregate and redistribute events, or a switch to a dedicated real-time infrastructure like Ably or Pusher with explicit fan-out.

The database would need connection pooling (PgBouncer is built into Supabase), read replicas for the `get_board_state` queries, and potentially moving to an event-sourced model where changes are appended to a log and the current state is materialized. We'd also want to batch broadcast messages — instead of one WebSocket message per object change, batch all changes within a 16ms window (one frame) into a single message. The AI endpoint would benefit from a queue: instead of executing tools synchronously in the HTTP request, enqueue tool calls and stream results back via SSE or the WebSocket channel.

### 13. Why did you choose react-konva over alternatives like Fabric.js, PixiJS, or raw SVG?

react-konva provides a declarative React API (`<Rect>`, `<Circle>`, `<Group>`) on top of HTML5 Canvas. This means board objects are React components with props, not imperative draw calls. When an object's position changes, React re-renders just that component, and react-konva efficiently updates only the affected Konva node. This fits naturally with our React state management — `objects.map(obj => <StickyNote key={obj.id} ... />)` is idiomatic React.

Fabric.js has a similar API but doesn't have a React wrapper with the same maturity. PixiJS is optimized for WebGL/sprites (games), not 2D shapes with text. Raw SVG would work but struggles with 500+ elements because each is a DOM node, while Canvas renders everything to a single bitmap. react-konva also includes built-in `Transformer` (resize/rotate handles), `dragDistance` for distinguishing clicks from drags, and efficient hit detection — features we would have had to build from scratch with raw Canvas.

### 14. How does the text editing work on a Canvas-based application?

HTML5 Canvas doesn't have native text editing — you can draw text as pixels, but there's no cursor, no selection, no clipboard integration. Most Canvas apps solve this by overlaying an HTML `<textarea>` on top of the canvas during editing. We follow this pattern.

When a user double-clicks a sticky note or text element, we calculate the object's screen position using `stage.getAbsoluteTransform().point()`, create a `<textarea>` element, and position it absolutely over the canvas. The textarea matches the object's width, height, font size, and background color, all scaled by the current zoom level. When the user clicks away (blur event) or presses Escape, we read the textarea's value, persist it to the object's properties, and remove the textarea. The Konva `<Text>` component then renders the updated text. This gives us full native text editing (selection, copy/paste, IME input) without reimplementing any of it.

### 15. How does your optimistic update pattern work, and what happens when a write fails?

When a user creates, updates, or deletes an object, three things happen in this order: (1) local React state is updated immediately via `setObjects()`, (2) the change is broadcast to other clients via the Supabase channel, and (3) the change is persisted to the database. Steps 2 and 3 are asynchronous — the user sees their change instantly without waiting for the network.

If the database write fails (step 3), we log the error but don't roll back the local or broadcast changes. This means there's a brief window where clients have diverged from the database. On the next page refresh or reconnect, clients reload from the database and converge. For MVP scope, this is acceptable — write failures are rare (they'd require a Supabase outage or RLS violation), and the cost of implementing rollback with compensation events exceeds the benefit. A production system might add a "pending changes" indicator and retry logic.

### 16. What's the security model, and what are the known gaps?

The Supabase anon key is exposed in client-side JavaScript — this is by design in Supabase's architecture. Security is enforced by Row-Level Security (RLS) policies on every table. Currently, the policies are permissive: any authenticated user can read and write any board. This means User A can see and modify User B's boards. This is a known MVP scope limitation, not a bug.

The known gaps are: (1) no board membership model — production would add a `board_members` table and restrict RLS policies to members only; (2) the AI endpoint authenticates via session cookie but doesn't rate-limit — a malicious user could spam AI commands and run up API costs; (3) the JSONB properties column isn't validated server-side — a crafted API call could store arbitrary JSON. The AI endpoint uses the authenticated user's session, not the service role key, so RLS still applies. The `SUPABASE_SERVICE_ROLE_KEY` is only used server-side and never exposed to clients.

### 17. How does the connector (arrow) system work?

Connectors are stored as `board_objects` with type `connector`. Their `properties` contain `fromId` and `toId` — the IDs of the source and target objects. The connector itself has `x: 0, y: 0, width: 0, height: 0` because its position is computed dynamically from its endpoints.

At render time, the `Connector` component looks up the source and target objects from the current `objects` array, computes their centers (accounting for circles whose x/y is the center vs. rectangles whose x/y is the top-left corner), and draws a Konva `<Arrow>` between them. If either endpoint object is deleted, the connector returns `null` (doesn't render). Connectors automatically follow their endpoints during drag because the `objects` array updates with new positions, causing the Connector to re-compute and re-render. This means connectors are always visually correct without any explicit update when endpoints move.

### 18. How does your application handle offline/disconnection scenarios?

Three layers of detection. First, the browser's `navigator.onLine` API detects complete network loss. Second, each Supabase channel reports status changes (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`). Third, the `hasBeenConnected` ref in `useBoard` distinguishes between initial connection and reconnection.

When any layer detects disconnection, a `ConnectionStatus` banner appears with "Reconnecting..." (or "You are offline" for complete network loss). Supabase channels automatically attempt to reconnect with exponential backoff. On successful reconnect, the `SUBSCRIBED` callback fires, and because `hasBeenConnected` is true, we reload the full board state from the database. This catches any changes that were broadcast while we were disconnected. During offline periods, local changes are lost (they aren't queued) — this is a documented limitation. The user sees the banner and knows their edits won't sync until reconnected.

### 19. Why did you build the AI in a single API route instead of a separate microservice?

The AI logic is ~370 lines in one file (`app/api/ai-command/route.ts`). It includes the system prompt, tool definitions reference, tool execution (DB operations), and the agentic loop. This all-in-one approach was deliberate for a one-week sprint — it minimizes deployment complexity, has zero network hops between the AI logic and the database, and is trivially debuggable (one file, one request, one response).

A separate microservice would add: a new deployment target, network latency between the AI service and the database, authentication between services, and a message format to define between them. For the current scale (single-digit concurrent AI requests), the serverless function is more than sufficient. If AI traffic grew significantly, we might extract the tool execution into a separate service with a queue, but the agentic loop itself is lightweight — it's just Claude API calls and Supabase queries, both I/O-bound, which is exactly what serverless functions excel at.

### 20. Walk me through what happens when User A creates a sticky note and User B sees it appear.

User A clicks "Note" in the toolbar. `BoardWrapper.handleCreateStickyNote()` fires: picks a random color from the colorblind-safe palette, calculates the viewport center, and calls `useBoard.createObject()`. This function (1) immediately appends the new object to local React state via `setObjects()`, making it appear on User A's canvas instantly. Then (2) it inserts the object into the `board_objects` table via Supabase, receiving back the full row with server-generated `id` and timestamps. Then (3) it broadcasts an `object-create` event on the `board-objects-{boardId}` channel with the full object as payload.

User B's browser has an active subscription on the same Broadcast channel. The `object-create` handler fires: it checks that the object ID doesn't already exist in local state (dedup guard), then appends it via `setObjects()`. React re-renders the Board component, which iterates through `sortedObjects` and renders a new `<StickyNote>` Konva component at the received coordinates. The ARIA announcer in User B's browser does not announce this (we only announce locally-initiated actions and presence changes). Total latency from A's click to B's render is typically 50-100ms — dominated by the Broadcast channel's delivery time. The DB write runs in parallel and doesn't block User B's render.
