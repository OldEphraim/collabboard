# CollabBoard Testing Checklist — Phase 8

Run all scenarios below and mark pass/fail. Fix any failures before submission.

## Spec Testing Scenarios

| # | Scenario | Steps | Pass/Fail | Notes |
|---|----------|-------|-----------|-------|
| 1 | **2 users editing simultaneously** | Open board in 2 different browsers (or incognito). Both create/move/edit objects at the same time. Verify changes appear on both screens in <1s. | | |
| 2 | **Refresh mid-edit** | Create several objects, move some around. Refresh the page. Verify all objects reload in their correct positions (state persistence). | | |
| 3 | **Rapid creation and movement** | Rapidly create 10+ sticky notes and immediately start dragging them around. Verify sync holds up — objects should appear on the other client and movements should replicate smoothly. | | |
| 4 | **Network disconnection recovery** | Open board in Chrome. Go to DevTools → Network → check "Offline". Wait 5s. Uncheck "Offline". Verify: (a) "Reconnecting..." banner appears when offline, (b) banner disappears on reconnect, (c) board state reloads correctly, (d) sync resumes. | | |
| 5 | **5+ concurrent users** | Open 5+ browser tabs/windows (some incognito with different accounts). All editing the same board. Verify no degradation — objects sync, cursors move, presence bar shows all users. | | |

## AI Agent Testing

| # | Scenario | Command to Test | Pass/Fail | Notes |
|---|----------|----------------|-----------|-------|
| 6a | **Creation command** | "Create a yellow sticky note that says Hello" | | |
| 6b | **Creation command** | "Create a blue rectangle at position 500, 300" | | |
| 6c | **Manipulation command** | "Change the color of the sticky note to pink" | | |
| 6d | **Layout command** | "Arrange all sticky notes in a grid" | | |
| 6e | **Complex command** | "Create a SWOT analysis template with four quadrants" | | |
| 6f | **Complex command** | "Build a user journey map with 5 stages" | | |
| 6g | **Complex command** | "Set up a retrospective board with What Went Well, What Didn't, and Action Items" | | |
| 7 | **Response latency** | Run `npx tsx scripts/test-ai-latency.ts <boardId> <cookieValue>`. Single-step commands must be <2s. | | |
| 8 | **Two users issuing AI commands simultaneously** | Two browsers, both send an AI command at the same time. Verify both commands execute and objects appear for both users. | | |
| 9 | **AI objects visible to all users** | One user sends an AI command. Verify created objects appear on the other user's screen (via broadcast sync). | | |

## Performance Spot-Checks

| # | Scenario | Steps | Pass/Fail | Notes |
|---|----------|-------|-----------|-------|
| 10 | **60 FPS during pan/zoom** | Open Chrome DevTools → Performance tab. Record while panning and zooming around the board. Verify frame rate stays at or near 60 FPS. | | |
| 11 | **50+ objects sync** | Run `npx tsx scripts/test-bulk-create.ts <boardId> 60`. Open board in 2 browsers. Verify all objects render and sync holds up. Pan/zoom should remain smooth. | | |

## Test Script Reference

### Bulk Object Creation
```bash
# Create 60 objects (default) on a board
npx tsx scripts/test-bulk-create.ts <boardId>

# Create a custom number of objects
npx tsx scripts/test-bulk-create.ts <boardId> 100
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

### AI Latency Test
```bash
# Run against local dev server
npx tsx scripts/test-ai-latency.ts <boardId> <cookieValue>

# Run against production
npx tsx scripts/test-ai-latency.ts <boardId> <cookieValue> https://collabboard-black.vercel.app
```

To get the cookie value:
1. Log in to CollabBoard in your browser
2. Open DevTools → Application → Cookies → your domain
3. Find the `sb-tfftzaohkjhydozaqsfu-auth-token` cookie
4. Copy the full value (starts with `base64-`)

## Automated E2E Tests (Playwright)

Automated tests cover the core evaluator scenarios. They run against the local dev server.

### Prerequisites
- Dev server running: `npm run dev`
- `.env.local` configured with Supabase and Anthropic keys
- Playwright browsers installed: `npx playwright install chromium`

### Running
```bash
# Run all e2e tests
npx playwright test

# Run with headed browser (visible)
npx playwright test --headed

# Run a specific test
npx playwright test -g "objects persist"
```

### Test Coverage
| Test | Scenario |
|------|----------|
| objects persist after refresh | Create object, refresh, verify still in DB |
| two users see each other's objects | Two browser contexts, User A creates, User B sees |
| cursor sync between users | User A moves mouse, User B sees cursor element |
| AI command creates objects | POST to /api/ai-command, verify object in DB |
| reconnection banner appears when offline | Set offline, check banner, go online, check hidden |

## Results Summary

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Frame rate during pan/zoom | 60 FPS | | |
| Object sync latency | <100ms | | |
| Cursor sync latency | <50ms | | |
| Object capacity | 500+ objects | | |
| Concurrent users | 5+ without degradation | | |
| AI single-step latency | <2000ms | | |
