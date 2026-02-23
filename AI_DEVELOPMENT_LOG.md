# CollabBoard — AI Development Log & Cost Analysis

## Tools & Workflow

**Primary tools:** Claude Code (CLI coding agent) + claude.ai (architecture and strategy)

**Workflow:** A dual-window approach where claude.ai served as the architect and Claude Code served as the builder. In a typical cycle:

1. I'd test the application and identify what was working or broken
2. I'd describe the results to claude.ai, which would analyze the problem and draft a precise prompt for Claude Code
3. I'd send that prompt to Claude Code, which would implement the changes across multiple files
4. I'd test again and report back to claude.ai

This separation was deliberate. Claude Code is excellent at writing and modifying code across a large codebase, but it struggles with high-level debugging strategy — particularly when the issue involves interactions between multiple systems (e.g., Supabase Realtime + React StrictMode + WebSocket lifecycle). claude.ai, with its larger context window and conversational interface, was better at synthesizing console logs, stack traces, and system behavior into a diagnosis. The two tools complemented each other well.

**Secondary tools:** ChatGPT (GPT-4) was used for an independent review of the Pre-Search architecture document, identifying five areas for improvement. A small amount of additional claude.ai usage went to general research and historical/language questions unrelated to the project.

## MCP Usage

Claude Code was directed to use the Supabase MCP integration for direct database inspection during development. The filesystem MCP was used implicitly through Claude Code's standard file access. The Supabase MCP enabled Claude Code to inspect table schemas, verify RLS policies, and check realtime publication configuration without requiring me to manually copy-paste query results.

## Effective Prompts (5 examples)

**1. Phase 3 debugging — Realtime sync diagnosis**
```
Phase 3 testing update — live drag sync works, but there are regressions and remaining issues:

WORKING:
- Live object dragging syncs bidirectionally between windows ✓

BROKEN (regressions from this round of changes):
1. Cannot create new sticky notes or rectangles. Console shows: [useBoard] Create failed: {} 
   at useBoard.ts:196. This was working before the last round of changes.
2. Cannot edit sticky note text. Double-clicking no longer opens the text editor.
3. Rectangle resize and rotation not reflected in other browser.

STILL BROKEN (from before):
4. Cursor only updates on click, not on continuous mouse movement.

Please fix items 1-4. Do not move to Phase 4 until object creation, text editing, transform 
sync, and continuous cursor tracking all work.
```
*Why it worked:* Structured as WORKING/BROKEN/STILL BROKEN with specific error messages and file locations. Claude Code could immediately prioritize and fix without asking clarifying questions.

**2. Architecture pivot — Broadcast-based sync**
```
Realtime channels are now SUBSCRIBED — big improvement. But sync is discrete, not continuous.
The postgres_changes approach isn't delivering events. Replace the entire postgres_changes sync 
mechanism with Broadcast-based sync — the same mechanism that already works for drag sync. 
Now every CRUD operation should broadcast the change. Add config: { broadcast: { self: false } } 
to eliminate the need for the localMutations dedup pattern.
```
*Why it worked:* Identified the working pattern (Broadcast for drags) and directed Claude Code to generalize it, rather than asking it to debug the failing pattern (postgres_changes). Working with what works, not fighting what doesn't.

**3. AI latency optimization**
```
Single-step AI latency is ~3s, target is <2s. Two optimizations:
1. Skip the final text-generation round-trip for simple commands. After executing tool calls, 
   if all tools succeeded, return immediately with a summary like "Created 1 object" instead 
   of making a second API call.
2. Trim the system prompt. Move detailed template recipes out of the system prompt and into 
   a reference that's only included when the command looks complex.
```
*Why it worked:* Specific, measurable target (< 2s), two concrete approaches with clear rationale. Claude Code implemented both and latency dropped from ~3s to ~1.1s.

**4. Playwright test suite expansion**
```
Expand the Playwright test suite to cover more evaluator scenarios. Add these tests:
1. "rapid creation and movement" — User A creates 10 sticky notes rapidly. Verify all 10 in DB.
2. "5+ concurrent users" — Create 5 browser contexts, each creates one note, verify all see all 5.
3. "AI complex command — SWOT analysis" — Verify 4+ objects with Strengths/Weaknesses/
   Opportunities/Threats text.
[... 8 more specific test descriptions ...]
Keep existing 5 tests. Use createBoard helper for isolation. Push when done.
```
*Why it worked:* Each test had a one-line description of the exact assertion. Claude Code generated all 11 tests correctly on the first attempt, and 15/16 passed immediately.

**5. Accessibility overhaul plan**
```
Phase 9b: Accessibility Overhaul. The developer is colorblind. This is a personal accessibility 
feature, not a checkbox exercise. Current codebase has zero ARIA attributes. Color palettes use 
red/green which are indistinguishable for protanopia/deuteranopia.

Items: (1) Colorblind-safe palettes with text labels, (2) High-contrast mode toggle, 
(3) Keyboard navigation (Tab, arrows, Enter, Escape, Ctrl+A), (4) Screen reader announcements 
via ARIA live regions, (5) Accessible toolbar with aria-labels and focus indicators.
```
*Why it worked:* Claude Code generated a comprehensive implementation plan covering 13 files and 3 new files, then executed it cleanly. The personal motivation framing ("not a checkbox exercise") helped it prioritize usability over compliance theater.

## Code Analysis

**Estimated split: ~99% AI-generated code, ~1% hand-written**

Claude Code wrote virtually all application code, component logic, hooks, API routes, test files, and documentation. My direct code contributions were limited to editing `CLAUDE.md` (the project roadmap) when I disagreed with the planned approach.

However, this split understates human contribution. The project's architecture, phase ordering, debugging strategy, and every prompt to Claude Code were crafted collaboratively between me and claude.ai. I made all DevOps decisions (Vercel deployment, Supabase configuration, environment variables, auth redirect URLs, disabling email confirmation). I ran all manual testing, identified regressions, and decided when to move between phases. The AI wrote the code; I directed what code to write and verified it worked.

## Strengths & Limitations

**Where AI excelled:**
- **Scaffolding and boilerplate.** Phases 1-2 (auth, routing, canvas, persistence) were generated quickly and worked on first attempt. Standard Next.js + Supabase patterns are well-represented in training data.
- **Canvas components.** react-konva components (StickyNote, Shape, Frame, etc.) were generated correctly with drag, resize, and transform handling. Konva's declarative API maps well to how LLMs reason about React components.
- **Test generation.** 16 Playwright tests were generated with meaningful assertions, proper isolation, and correct Supabase auth cookie handling. 15/16 passed on first run.
- **Accessibility implementation.** The colorblind-safe palette, keyboard navigation, ARIA attributes, and high-contrast mode were implemented across 13+ files in a single session with no regressions.
- **Documentation.** README, ARCHITECTURE.md, ACCESSIBILITY.md, and TESTING.md were all generated with accurate technical detail.

**Where AI struggled:**
- **Real-time sync debugging.** The hardest problem in the project — why Supabase postgres_changes wasn't delivering events — required me to analyze console logs, WebSocket frames, and React DevTools stack traces, then synthesize the diagnosis in claude.ai before Claude Code could act. Claude Code couldn't debug this independently because it couldn't observe the runtime behavior.
- **Regression awareness.** When fixing one feature, Claude Code would sometimes break another. The Phase 3 cycle of "fix cursors → break object creation → fix creation → break text editing" required me to test after every change and report what regressed.
- **Runtime environment issues.** API key formats, Supabase dashboard configuration, Vercel environment variables, auth redirect URLs — anything requiring interaction with a web dashboard or external service was entirely manual.

## Key Learnings

1. **The architect/builder split is the most effective AI workflow.** Using claude.ai for strategy and Claude Code for implementation avoids the failure mode where a coding agent thrashes on a problem it can't observe. The human (or a second AI) provides the observational feedback loop.

2. **Prompt specificity correlates directly with output quality.** Vague prompts ("fix the sync") produced vague attempts. Structured prompts with WORKING/BROKEN sections, specific error messages, and file locations produced targeted fixes. The time spent crafting a good prompt is always worth it.

3. **AI is strongest on well-patterned tasks and weakest on novel system interactions.** Standard React components, CRUD operations, and test generation are solved problems with abundant training data. But debugging a specific interaction between React 18 StrictMode, Supabase Realtime channels, and WebSocket lifecycle management required human reasoning about a novel combination.

4. **"Working with what works" beats "debugging what doesn't."** The pivot from postgres_changes to Broadcast-based sync happened because I recognized that Broadcast was already working for drag sync and directed Claude Code to generalize that pattern. An AI coding agent left to its own devices would likely have spent hours trying to fix postgres_changes.

5. **Testing should be automated early.** The 16 Playwright tests caught issues that manual testing missed and gave confidence for the accessibility refactor. If I did this again, I'd write automated tests after Phase 3 (multiplayer), not Phase 8.

---

# AI Cost Analysis

## Development & Testing Costs

| Cost Category | Amount | Notes |
|---|---|---|
| **Anthropic API (Claude Haiku 4.5)** | $1.32 | 658,985 input tokens + 49,072 output tokens. Used for AI agent endpoint during development and testing. |
| **Claude Max subscription** | ~$100-120/mo | Personal subscription covering claude.ai (architecture/strategy) and Claude Code (implementation). Pre-existing subscription, not project-specific. |
| **ChatGPT Plus subscription** | $20/mo | Used for Pre-Search document review. Pre-existing subscription. |
| **Supabase** | $0 | Free tier: 500MB database, Realtime connections, Auth |
| **Vercel** | $0 | Free tier: hosting, serverless functions, CI/CD |
| **Total project-specific API cost** | **$1.32** | |
| **Total including subscriptions (prorated ~1 week)** | **~$30-35** | |

### Token Breakdown (Anthropic API)

| Metric | Value |
|---|---|
| Input tokens | 658,985 |
| Output tokens | 49,072 |
| Total tokens | 708,057 |
| Total API calls | ~50-70 (estimated from token volume) |
| Average tokens per call | ~10,000 input / ~750 output |

The high input-to-output ratio reflects the agentic loop pattern: each AI command sends the full board state + system prompt + tool definitions as input (~8,000-12,000 tokens), but tool call responses are short (~100-500 tokens each).

## Production Cost Projections

### Assumptions

| Parameter | Value | Rationale |
|---|---|---|
| AI commands per user per session | 5 | Casual use: create a template, arrange objects, a few edits |
| Sessions per user per month | 8 | ~2 sessions/week for active users |
| AI commands per user per month | 40 | 5 × 8 |
| Avg input tokens per command | 10,000 | System prompt (~3,000) + board state (~5,000) + tool defs (~2,000) |
| Avg output tokens per command | 750 | Tool calls + brief responses |
| Model | Claude Haiku 4.5 | $1.00/M input, $5.00/M output |
| Supabase | Pro plan at scale | $25/mo base, scales with usage |
| Vercel | Pro plan at scale | $20/mo base |

### Cost per AI Command

| Component | Cost |
|---|---|
| Input: 10,000 tokens × $1.00/M | $0.01 |
| Output: 750 tokens × $5.00/M | $0.00375 |
| **Total per command** | **~$0.014** |

### Monthly Projections

| | 100 Users | 1,000 Users | 10,000 Users | 100,000 Users |
|---|---|---|---|---|
| AI commands/month | 4,000 | 40,000 | 400,000 | 4,000,000 |
| AI API cost | $56 | $560 | $5,600 | $56,000 |
| Supabase | $25 | $75 | $300 | $1,500 |
| Vercel | $20 | $20 | $50 | $200 |
| **Total** | **~$100/mo** | **~$655/mo** | **~$5,950/mo** | **~$57,700/mo** |

### Cost Optimization Opportunities

At scale, several optimizations would reduce the AI API cost significantly:

1. **Prompt caching:** Anthropic's prompt caching would reduce input token costs by ~90% for the system prompt and tool definitions, which are identical across calls. This alone would cut AI costs roughly in half.
2. **Board state summarization:** Instead of sending all objects, summarize the board state for simple commands ("3 sticky notes, 2 rectangles"). Only send full state for manipulation/layout commands.
3. **Client-side command routing:** Simple commands like "create a yellow sticky note" don't need AI — they can be pattern-matched client-side and executed directly. Reserve the AI endpoint for commands that require reasoning.
4. **Response caching:** Template commands ("create a SWOT analysis") produce similar outputs. Cache the tool call sequences for common templates.

With prompt caching and client-side routing for simple commands, the 10,000-user projection could realistically drop from ~$5,950 to ~$2,000-3,000/month.