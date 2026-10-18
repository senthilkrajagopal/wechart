# wechart's end-to-end suites

Each suite has its own Playwright config. Every suite needs the docker-compose stack up.

| Suite | Config | Run it with | Holds |
|---|---|---|---|
| Main | `playwright.config.ts` | `pnpm --filter @wechart/e2e test` | Everything in `e2e/` outside `security/` and `mcp/`, with sign-in off. It starts its own API (4100) and web preview (5273). |
| Security | `playwright.security.config.ts` | `pnpm --filter @wechart/e2e e2e:security` | `e2e/security/`, with sign-in on through Dex. It starts its own API (4300) and web preview (5373). |
| MCP | `playwright.mcp.config.ts` | `pnpm --filter @wechart/e2e e2e:mcp` | `e2e/mcp/`: real Claude Code against `/mcp` (T790, AC-444). |

## The MCP suite

It is never part of the default run, because its `claude -p` makes live model calls on the account Claude Code is signed in to on this machine. Run it only when you mean to.

- **Before you run it:**
  - the `claude` CLI is on `PATH` and signed in;
  - the compose stack is up;
  - port 4580 is free.
- **What it does:**
  - `e2e:mcp` builds the API first;
  - each spec starts an API of its own on port 4580, with sign-in on and `WECHART_MCP_HOST=mcp.wechart.test`, on a database it makes and drops;
  - Claude Code reaches that host through a forward proxy the spec runs (`HTTP_PROXY`), as an ingress would.
- **Config:** `claude mcp add` and `claude mcp get` use a scratch `CLAUDE_CONFIG_DIR`, so your own Claude config isn't changed.
- **Model:** `claude -p` uses `haiku`.
- **Locks:** like the other suites, run it under the e2e lock (`lockf -k /private/tmp/wechart-e2e.lock …`) where other runs share the stack.
