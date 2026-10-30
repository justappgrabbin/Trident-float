# SynthAI Computer — Contract Surface v1 (automata-architecture)

The Computer is the orchestration residence of an automata organism.
Canonical pipeline: EVENT/INPUT -> ADDRESS RESOLUTION -> STATE-SPACE ->
AUTOMATA/PROCESS ACTIVATION -> ROUTING/INTERACTION -> ACTION ->
OBSERVABLE RESULT -> VERIFICATION -> STATE TRANSITION -> TRAJECTORY -> NEXT STATE.

Canonical address grammar (13 dims, immutable): planetary, dimension, gate,
line, color, tone, base, degree, minute, second, arc, zodiac, house.

## Contracts
- execute(request)        -> routed real execution via selected provider
- route(capability, ctx)  -> provider selection + recorded routing_decision
- observe(componentId)    -> runtime observability record (loaded/instantiated/
                             invoked/input/output/consumer/state-change/error)
- remember(record)        -> append-only memory; conclusions preserve previous+evidence
- resolveAddress(entityOrEvent) / compareAddresses(a,b) /
  resolveRelationship(a,b,context) / traceAddressHistory(entity)
- resolveState(entity, event, context) -> identity, address, current state,
  context, relationships, active structures, trajectory, confidence/provenance,
  source provider
- mount(application, contract)   -> app consumes shared services, stays an app
- build / browse / experiment / persist / communicate / verify
- emitEvent(event)        -> shared event grammar v1
- queryCapability(name)   -> registry lookup with provider statuses
- querySystem(query)      -> system graph query

## Rules
- LLMs are optional participants; never owners of identity, state, lineage,
  memory, routing, verification, addressing, runtime truth.
- State-space providers remain sovereign modules behind these contracts.
- Individual automata keep their own boundaries, I/O, state, activation conditions.
- Unknown fields stay unknown. No fabricated resolution.

## Verification semantics (Amendment C, 2026-09-22)
- Federation transfer != successful interaction. A message/task arriving at a
  provider is NOT proof of interaction.
- CONSUMPTION RECEIPT = proof that the interaction actually reached a consumer
  and was consumed downstream (e.g. result written into append-only state,
  referenced by a subsequent process, or persisted with a consumer id).
- A route is VERIFIED only with BOTH: (1) a consumption receipt and (2) an
  observable state change. WIRED requires real executed I/O on the hop itself.
- Canonical-address authority: back-up-:execution-spine-canonical-address
  decides canonicity of completed addresses; kimi DMS codec is a specialized
  constructor of address parts (see capability-registry.json conclusions).

## Truth record (Amendment C)
- Android/Capacitor in current SynthAi assembly: NOT FOUND.
- Android/mobile residence in wider ecosystem: PRESENT / REQUIRES PROVIDER
  INVENTORY (Synthai2 Capacitor, Stellar APK shell + MCP 17 tools, historical
  packages). Never record "absent everywhere".
- Synthia Server = justappgrabbin/Synthia-server; Computer/GitHub bridge work
  on branch computer-github-bridge-2026-09-22. Open: authoritative branch,
  bridge convergence, Computer->bridge->real GitHub->result-into-events path.

