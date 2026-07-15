# v8-lens

Real-time observability for Node.js processes via the Chrome DevTools Protocol — no code changes required.

Connects to any running Node.js process and visualizes heap memory, GC events, CPU profiling, and event loop lag in real time from the outside, without modifying or restarting the observed process.

## Requirements

- Node.js >= 22.0.0

## Install

```bash
npm install -g v8-lens
# or
pnpm add -g v8-lens
```

---

## Usage

```bash
v8-lens
```

v8-lens will scan for running Node.js processes on your system, present an interactive list, and let you select which one to observe. No `--inspect` flag needed — v8-lens activates the inspector on the selected process automatically via `SIGUSR1`.

Once connected, the dashboard opens at `http://localhost:5173`.

### CPU profiling

While v8-lens is running, use these keys in the terminal:

| Key | Action                                 |
| --- | -------------------------------------- |
| `p` | Start CPU profile                      |
| `s` | Stop CPU profile and send to dashboard |
| `q` | Quit                                   |

---

## Docker

When the observed process runs inside a Docker container, v8-lens cannot use its automatic process scanner — `SIGUSR1` cannot cross the container boundary. Follow these steps instead.

**Step 1 — expose the CDP port in your `docker-compose.yml`**

```yaml
services:
  app:
    image: your-image
    ports:
      - '9229:9229'
```

Then start or restart the container:

```bash
docker compose up
```

> If your container is already running without the port mapped, Docker does not allow adding ports to a running container. The simplest fix is to add the port to `docker-compose.yml` and run `docker compose up` again — it will recreate the container with the port mapped.

**Step 2 — add `--inspect` to your start script and run it**

In your `package.json` inside the container, add `--inspect=0.0.0.0:9229` to the dev start script so Node exposes the CDP inspector on all interfaces:

```json
"scripts": {
  "start": "node --inspect=0.0.0.0:9229 server.js"
}
```

The `0.0.0.0` binding is important — without it Node binds the inspector to `127.0.0.1` inside the container, which is not reachable from the host even with the port mapped.

**Step 3 — get the exact WebSocket URL**

Once the process is running, fetch the CDP target list from your host machine:

```bash
curl http://127.0.0.1:9229/json/list
```

You will get a response like this:

```json
[
  {
    "id": "a1b2c3d4-e5f6-...",
    "title": "server.js",
    "type": "node",
    "webSocketDebuggerUrl": "ws://127.0.0.1:9229/a1b2c3d4-e5f6-..."
  }
]
```

Copy the `webSocketDebuggerUrl` value.

**Step 4 — connect v8-lens with the `--url` flag**

```bash
v8-lens --url ws://127.0.0.1:9229/a1b2c3d4-e5f6-...
```

The `--url` flag bypasses the process scanner and connects directly to the CDP WebSocket that Docker Compose is forwarding to your host machine.

---

## Interpreting the metrics

### Heap

The heap panel shows three values over time:

- **used** (purple line) — memory actively occupied by live JavaScript objects. This is the number to watch.
- **total** (dark area) — total heap space V8 has reserved from the OS. V8 reserves more than it needs to avoid asking the OS for memory too frequently.
- **external** (green dashed line) — memory used by TypedArrays and Node.js Buffers, which live outside the JS heap but are still owned by your process.

**What a healthy process looks like:**

```
heap
 │
 │                    ╭─╮ ╭─╮ ╭──╮ ╭─╮
 │                   ╭╯ ╰─╯ ╰─╯  ╰─╯ ╰╮         Major GC
 │                  ╭╯                  ╰─────╮      ↓
 │                 ╭╯                         ╰──────╯
 │─────────────────╯                                   ──────────────
 │
 │◄── at rest ────►│◄──────── under load ────────────►│◄── at rest ──
 │   flat, low      allocations + minor GC drops        back to baseline
 │
 └──────────────────────────────────────────────────────────────────► time
```

**At rest** — flat line well below `total`. No allocations, no GC activity. This is the baseline to remember.

**Under load** — `used` climbs as Node allocates objects for each request. Minor GC events cause small drops along the way. Eventually V8 triggers a Major GC — a large sudden drop that sweeps the entire heap.

**After load** — heap returns to roughly the same flat baseline. If the post-load baseline matches the pre-load baseline, the process has no leak.

A leak looks different — the baseline creeps up with each load cycle and never fully recovers:

```
heap
 │
 │                                                     ────────────
 │                              ╭───────────────╮
 │               ╭──────────────╯               ╰────────
 │  ─────────────╯
 │
 └──────────────────────────────────────────────────────────────────► time
    baseline₁     baseline₂ (higher)    baseline₃ (higher still)
```

**Patterns to recognize:**

| Pattern                           | What it looks like                                | What it means                                                          |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Flat line (used well below total) | used stable, large gap to total ceiling           | Healthy baseline — process is idle, GC has nothing to do               |
| Sawtooth under load               | used rises gradually, drops on GC events          | Normal behavior under load — GC keeping up                             |
| Staircase under load              | used rises in steps, never drops back to baseline | Objects being retained across requests — possible memory leak          |
| Flat line (used close to total)   | used hugging the total ceiling                    | Heap under pressure — GC working hard to keep up, little headroom left |
| Large sudden drop                 | used falls sharply in one step                    | Major GC — V8 did a full heap sweep, freed a large batch of objects    |
| Baseline rising over time         | each load cycle leaves used higher than before    | Accumulative retention — likely a real memory leak                     |
| External growing independently    | external rises while used is stable               | Buffer or TypedArray accumulation outside the JS heap                  |

**Header stats:**

- **used** — latest sample
- **total** — latest total reserved
- **external** — latest external memory
- **peak** — highest used value in the current window
- **avg** — average used over the current window

---

### Event Loop

The event loop panel measures lag — the difference between when a timer was expected to fire and when it actually fired. High lag means the event loop was blocked doing synchronous work and could not process callbacks in time.

**Thresholds:**

| Color  | Lag      | Meaning                                               |
| ------ | -------- | ----------------------------------------------------- |
| Green  | < 50ms   | Normal — event loop is responsive                     |
| Yellow | 50–200ms | Elevated — some blocking work detected                |
| Red    | > 200ms  | Blocked — synchronous work is stalling the event loop |

**What causes high lag:**

- CPU-intensive synchronous operations (heavy computation, large JSON parsing, crypto)
- Synchronous filesystem operations (`readFileSync`, `writeFileSync`)
- Long-running middleware or request handlers that never yield
- GC pauses — a Major GC can pause the process for tens to hundreds of milliseconds

If you see high event loop lag at the same time as GC pressure in the heap panel, GC is likely the cause. v8-lens detects this cross-observable pattern and surfaces it as an anomaly.

---

### CPU (flame graph)

The CPU panel is populated on demand — press `p` to start a capture and `s` to stop it. The flame graph shows where the process spent its CPU time during that window.

**How to read the flame graph:**

- Each row is a level of the call stack
- Width is proportional to time — wider blocks consumed more CPU
- The bottom row is always the root of the call tree
- A block's children are stacked directly above it

**Colors:**

| Color  | Meaning                                          |
| ------ | ------------------------------------------------ |
| Purple | Your own code                                    |
| Green  | Node.js built-ins and libraries (`node_modules`) |
| Red    | Garbage collector                                |
| Gray   | Idle / root frames                               |
| Yellow | Functions with deoptimizations                   |

**Self time vs total time:**

- **total** — time spent in this function including everything it called
- **self** — time spent executing only this function's own code

A function with high total but low self is an orchestrator — it delegates work to others. A function with both high total and high self is where the real work (and potential bottleneck) lives. The top functions table below the flame graph sorts by self time to surface the real hotspots.

**Deoptimizations (⚠):**

When V8 compiles a function with its JIT compiler, it makes assumptions about types. If those assumptions turn out to be wrong at runtime (a variable changes type, an object changes shape), V8 reverts the optimization and re-compiles. Deoptimized functions can be 10–100x slower than their optimized equivalents.

Yellow blocks in the flame graph have one or more deoptimization reasons. Hover over them to see the specific reason V8 reported.

---

### GC Events

Each row in the GC panel is one detected GC event, showing:

- **Type** — Minor (young generation scavenge, fast) or Major (full heap mark-and-sweep, slow)
- **Freed** — how much memory was released
- **Duration** — how long the GC pause lasted (when available)
- **Time** — when it occurred

> **Note:** GC detection in v8-lens uses an approximation — it compares heap size between polling intervals and infers a GC occurred when the heap drops by more than 1MB. Type classification (Minor/Major) is based on the amount freed, not the actual V8 GC type. Exact pause duration requires agent mode (injecting into the observed process), which v8-lens does not do.

Frequent Major GC events are a signal worth investigating — each one pauses the process and directly adds latency to any requests being handled at that moment.

---

### Anomalies

v8-lens detects four types of anomalies automatically:

| Type                 | What triggers it                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------- |
| **Heap Leak**        | Heap grew more than 50MB over the last 20 samples (warn) or 100MB (critical)                 |
| **GC Pressure**      | More than 5 GC events in a 10-second window (warn) or 10 (critical)                          |
| **EL Block**         | Event loop lag exceeded 50ms (warn) or 200ms (critical)                                      |
| **GC-induced stall** | Heap pressure and event loop lag occurring simultaneously — likely GC pausing the event loop |

Anomalies appear in real time as they are detected. A red badge indicates at least one critical anomaly is active.

---

## Limitations

- **Unix only** — `SIGUSR1` is a POSIX signal not available on Windows
- **Development and staging only** — activating `--inspect` exposes a CDP port that should never be open in production
- **GC type and duration are approximated** — exact values require injecting an agent into the observed process, which v8-lens intentionally avoids
- **Event loop lag is measured indirectly** — v8-lens measures lag in its own process as a proxy for the observed process's event loop pressure

---

## How it works

v8-lens connects to the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — the same WebSocket interface that Chrome DevTools uses internally. When you select a process, v8-lens sends `SIGUSR1` to activate the inspector, then connects to the CDP WebSocket and subscribes to V8's internal events.

Collected metrics flow through a `SharedArrayBuffer` ring buffer to a Worker thread, which aggregates them and serves the dashboard over a local WebSocket connection. The observed process is never modified, injected into, or restarted.

---

## Author

Leonardo Bravo — [github.com/jleonardo007](https://github.com/jleonardo007)
