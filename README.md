# CollabBoard

A real-time collaborative whiteboard application with AI-powered board manipulation. Built as a one-week sprint for the Gauntlet AI program.

**Live Demo:** [collabboard-black.vercel.app](https://collabboard-black.vercel.app)

## Features

- **Infinite Canvas** — Pan and zoom with mouse drag and scroll wheel
- **Rich Object Types** — Sticky notes, rectangles, circles, lines, text, frames, and connectors
- **Real-Time Collaboration** — See other users' changes instantly (<100ms latency)
- **Multiplayer Cursors** — Live cursor positions with name labels and unique colors
- **Presence Awareness** — See who's online in the presence bar
- **AI Assistant** — Natural language commands to create and manipulate board objects (powered by Claude)
- **Multi-Select** — Shift+click or shift+drag to select multiple objects; bulk color, duplicate, delete
- **Copy/Paste** — Ctrl/Cmd+C/V for clipboard operations
- **Connection Recovery** — Automatic reconnection with visual "Reconnecting..." indicator

## Setup Guide

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [Anthropic API key](https://console.anthropic.com) (for AI features)

### Installation

```bash
git clone https://github.com/OldEphraim/collabboard.git
cd collabboard
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Database Setup

Run the SQL migrations in your Supabase SQL Editor (Dashboard > SQL Editor):

1. `supabase/migrations/001_initial.sql` — Creates tables, indexes, RLS policies, and realtime publication
2. `supabase/migrations/002_realtime_replica_identity.sql` — Sets REPLICA IDENTITY FULL for realtime

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with email/password, create a board, and start collaborating.

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16 + React 19 + TypeScript | App framework, routing, SSR for dashboard |
| Canvas | react-konva (Konva.js) | HTML5 Canvas rendering with declarative React API |
| Database | PostgreSQL via Supabase | Persistent storage with Row Level Security |
| Real-Time | Supabase Broadcast | WebSocket-based sync for objects and cursors |
| Auth | Supabase Auth | Email/password authentication with session management |
| AI Agent | Anthropic Claude (Sonnet 4.5) | Natural language board manipulation via tool use |
| Deployment | Vercel | Serverless hosting with edge functions |

### Real-Time Sync Architecture

CollabBoard uses **Supabase Broadcast** for all real-time synchronization:

```
User A edits object
    → Write to PostgreSQL (persistence)
    → Broadcast change via WebSocket channel
    → User B, C, ... receive broadcast and update local state
```

- **Object CRUD**: Write to DB first, then broadcast the change to other clients
- **Cursor positions**: Broadcast only (ephemeral, not persisted) — throttled to 50ms
- **Presence**: Supabase Presence API on the Broadcast channel
- **Channel config**: `{ broadcast: { self: false } }` so the sender doesn't receive their own events

This architecture was chosen over `postgres_changes` after discovering reliability issues with Supabase Realtime event delivery in our setup.

### AI Agent Design

The AI assistant uses Claude's tool-use API with an agentic loop:

1. User sends a natural language command (e.g., "Create a SWOT analysis")
2. The `/api/ai-command` endpoint sends the command to Claude with:
   - System prompt containing board state and layout guidelines
   - 11 tool definitions (create/move/resize/update/delete/query)
3. Claude responds with tool calls, which are executed against the database
4. If Claude needs more tool calls, the loop continues (up to 10 iterations)
5. Results are returned to the client, which updates local state and broadcasts to other users

**Supported command categories:**
- **Creation**: "Create a yellow sticky note that says Hello"
- **Manipulation**: "Move the sticky note to the center" / "Change its color to blue"
- **Layout**: "Arrange these notes in a grid" / "Space elements evenly"
- **Complex**: "Create a SWOT analysis" / "Build a user journey map" / "Set up a retrospective board"

### Conflict Resolution

CollabBoard uses a **last-write-wins** strategy for simultaneous edits:

- When two users edit the same object at the same time, the most recent write is persisted to the database
- Broadcast-based sync ensures all clients converge to the same state within ~100ms
- Optimistic local updates provide instant feedback — the UI updates immediately, then the change is written to DB and broadcast
- This is an intentional design trade-off: simplicity and low latency over operational transforms or CRDTs
- For the collaborative whiteboard use case, conflicts are rare (users typically work on different objects) and last-write-wins produces acceptable results

### Connection Recovery

- Both the board sync and presence channels track connection status
- When a WebSocket disconnects (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`), a "Reconnecting..." banner appears
- On reconnect, the board reloads all objects from the database to catch any changes missed during disconnection
- Browser online/offline events are also monitored for network-level detection

## Project Structure

```
app/
  page.tsx                  — Dashboard (list/create/rename/delete boards)
  board/[id]/page.tsx       — Board page (loads board, renders canvas)
  api/ai-command/route.ts   — AI agent API endpoint
  login/page.tsx            — Authentication page
  callback/route.ts         — Auth callback handler
components/
  canvas/
    Board.tsx               — Konva Stage with pan/zoom/selection
    BoardWrapper.tsx         — Orchestrator (hooks + toolbar + canvas + AI)
    StickyNote.tsx           — Draggable sticky note with inline editing
    Shape.tsx                — Rectangle with transform handles
    CircleShape.tsx          — Circle with transform handles
    LineShape.tsx            — Line with draggable endpoints
    Connector.tsx            — Arrow between two objects
    TextElement.tsx          — Standalone editable text
    Frame.tsx                — Container frame with title bar
    Toolbar.tsx              — Object creation toolbar
    SelectionActions.tsx     — Bulk actions bar (color, duplicate, delete)
  collaboration/
    Cursors.tsx              — Render other users' cursors
    PresenceBar.tsx          — Online users indicator
    AiChat.tsx               — AI command chat panel
    ConnectionStatus.tsx     — Reconnection banner
lib/
  hooks/useBoard.ts          — Board state, CRUD, broadcast sync
  hooks/usePresence.ts       — Cursor broadcast, presence tracking
  ai/tools.ts               — Claude tool definitions
  supabase/client.ts         — Browser Supabase client
  supabase/server.ts         — Server Supabase client
```

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
```

## Deployment

The app is deployed on Vercel. To deploy your own instance:

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set the four environment variables (see above)
4. Configure Supabase auth redirect URLs for your production domain
