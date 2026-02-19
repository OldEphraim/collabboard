#!/usr/bin/env npx tsx
/**
 * Test AI command latency across all 4 command categories.
 *
 * Usage:
 *   npx tsx scripts/test-ai-latency.ts <boardId> <cookieValue> [baseUrl]
 *
 * Arguments:
 *   boardId    - UUID of the board to run commands against
 *   cookieValue - The raw value of the sb-tfftzaohkjhydozaqsfu-auth-token cookie.
 *                 Get it from: browser DevTools → Application → Cookies →
 *                 localhost (or your domain) → sb-tfftzaohkjhydozaqsfu-auth-token
 *                 Copy the full value (starts with "base64-").
 *   baseUrl     - API base URL (default: http://localhost:3000)
 *
 * The script sends 5 commands covering creation, manipulation, layout, and
 * complex categories, logging response time and result count for each.
 */

const COOKIE_NAME = 'sb-tfftzaohkjhydozaqsfu-auth-token'

const boardId = process.argv[2]
const cookieValue = process.argv[3]
const baseUrl = (process.argv[4] || 'http://localhost:3000').replace(/\/$/, '')

if (!boardId || !cookieValue) {
  console.error(
    'Usage: npx tsx scripts/test-ai-latency.ts <boardId> <cookieValue> [baseUrl]'
  )
  console.error('')
  console.error('To get the cookie value:')
  console.error('  1. Log in to CollabBoard in your browser')
  console.error('  2. Open DevTools → Application → Cookies → your domain')
  console.error(`  3. Find the "${COOKIE_NAME}" cookie`)
  console.error('  4. Copy the full value (starts with "base64-")')
  process.exit(1)
}

interface TestCommand {
  category: string
  description: string
  text: string
}

const commands: TestCommand[] = [
  {
    category: 'Creation',
    description: 'Create a single sticky note',
    text: 'Create a yellow sticky note that says "Hello from AI test"',
  },
  {
    category: 'Creation',
    description: 'Create a shape',
    text: 'Create a blue rectangle at position 400, 200',
  },
  {
    category: 'Manipulation',
    description: 'Query board state',
    text: 'What objects are currently on the board? List them.',
  },
  {
    category: 'Layout',
    description: 'Arrange existing objects',
    text: 'Arrange all sticky notes on the board in a neat grid with even spacing',
  },
  {
    category: 'Complex',
    description: 'Multi-step template creation',
    text: 'Create a retrospective board with three sections: What Went Well (green notes), What Didn\'t Go Well (pink notes), and Action Items (blue notes). Add 2 starter notes in each section.',
  },
]

interface Result {
  category: string
  description: string
  latencyMs: number
  resultCount: number
  status: 'pass' | 'fail'
  message: string
  error?: string
}

async function runCommand(cmd: TestCommand): Promise<Result> {
  const start = performance.now()

  try {
    const res = await fetch(`${baseUrl}/api/ai-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${COOKIE_NAME}=${cookieValue}`,
      },
      body: JSON.stringify({ text: cmd.text, boardId }),
    })

    const latencyMs = Math.round(performance.now() - start)
    const data = await res.json()

    if (!res.ok) {
      return {
        category: cmd.category,
        description: cmd.description,
        latencyMs,
        resultCount: 0,
        status: 'fail',
        message: '',
        error: data.error || `HTTP ${res.status}`,
      }
    }

    return {
      category: cmd.category,
      description: cmd.description,
      latencyMs,
      resultCount: data.results?.length ?? 0,
      status: 'pass',
      message: (data.message || '').slice(0, 80),
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start)
    return {
      category: cmd.category,
      description: cmd.description,
      latencyMs,
      resultCount: 0,
      status: 'fail',
      message: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  console.log(`AI Latency Test`)
  console.log(`Board:    ${boardId}`)
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Commands: ${commands.length}`)
  console.log('─'.repeat(80))

  const results: Result[] = []

  for (const cmd of commands) {
    process.stdout.write(`[${cmd.category}] ${cmd.description}... `)
    const result = await runCommand(cmd)
    results.push(result)

    if (result.status === 'pass') {
      console.log(
        `${result.latencyMs}ms | ${result.resultCount} objects | ${result.message}`
      )
    } else {
      console.log(`FAIL (${result.latencyMs}ms) | ${result.error}`)
    }
  }

  console.log('─'.repeat(80))

  // Summary
  const passed = results.filter((r) => r.status === 'pass')
  const avgLatency =
    passed.length > 0
      ? Math.round(passed.reduce((sum, r) => sum + r.latencyMs, 0) / passed.length)
      : 0
  const maxLatency = passed.length > 0 ? Math.max(...passed.map((r) => r.latencyMs)) : 0
  const singleStep = passed.filter(
    (r) => r.category === 'Creation' || r.category === 'Manipulation'
  )
  const singleStepAvg =
    singleStep.length > 0
      ? Math.round(singleStep.reduce((sum, r) => sum + r.latencyMs, 0) / singleStep.length)
      : 0

  console.log(`\nSummary:`)
  console.log(`  Passed:              ${passed.length}/${results.length}`)
  console.log(`  Average latency:     ${avgLatency}ms`)
  console.log(`  Max latency:         ${maxLatency}ms`)
  console.log(`  Single-step avg:     ${singleStepAvg}ms (target: <2000ms)`)
  console.log(
    `  Single-step target:  ${singleStepAvg < 2000 ? 'PASS' : 'FAIL'}`
  )
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
