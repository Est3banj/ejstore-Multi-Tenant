# Isolated P0 regressions

Run from the repository root with Node **22**, Java **21**, the existing locked
CLI **15.15.0** (`tests/security-tools/node_modules/.bin` on PATH) and cached
Firestore emulator **1.20.4**:

```sh
npm ci --prefix tests/security-p0 --ignore-scripts --no-audit --no-fund
node tests/security-p0/run.mjs
```

No root/functions dependencies, Jest config or preexisting untracked tests are
required. The native Node runner requires **25 passes**, exactly one TAP summary,
and zero failures, skips, cancellations or todos. Its 240-second timeout tears
down the emulator process group and temporary directory.

## Provenance and coverage

The assertions adapt just the P0 blocks of the preexisting, user-owned untracked
`functions/tests/integration/{recharges,purchases,admin}.test.js` suites. Those
original files are not part of this change. Native Node assertions replace Jest;
fixture emails/passwords are synthetic and fixture IDs are unique.

| New suite | Original block | Cases |
| --- | --- | ---: |
| `recharges.test.cjs` | P0-1/P0-2, originally lines 1027–1308 | 12 |
| `purchases.test.cjs` | P0-3, originally lines 599–721 | 5 |
| `admin.test.cjs` | P0-4, originally lines 175–300 | 7 |
| `admin.test.cjs` | Added real API registry exclusion/tombstone assertion | 1 |

Real production handlers/services execute against real Admin SDK Firestore and
Auth emulators, including transactions, role/tenant claims lookup, inventory,
payment parsing and consumed-message documents. `boundaries.cjs` replaces only
config wiring (with real emulator clients), observability, outgoing notifications
and IMAP transport. It does not replace authorization or financial logic.
The registry assertion evaluates the real registry with inert unrelated handlers;
it verifies exclusion/tombstone metadata, not an HTTP 404 response.

The runner creates its own deny-all Firestore rules and emulator config in a
temporary directory. Project is fixed to `demo-ejstore-p0`; all emulator endpoints
are loopback (Firestore 8088, Auth 9098, hub 4408, logging 4508, websocket 9158).
It rejects occupied ports. Child processes receive a minimal environment, empty
temporary HOME, no ADC/tokens/.env, and the existing loopback socket guard. This
is not an OS-level network sandbox for Java. Repository Firebase configs and
`firestore.rules` are not used or rewritten.

## Limits and remaining work

- **From allowlisting is not sender authentication.** A forged From can pass;
  these tests do not establish SPF/DKIM/DMARC or payment-provider authenticity.
- Consumed-message IDs currently include tenant + UIDVALIDITY + UID, but not the
  payment mailbox identity. Mailbox migration/rotation namespacing remains pending.
- The manual `security-compatibility.yml` workflow now runs this gate in addition
  to its existing gates. It remains dispatch-only, read-only, without secrets,
  build or deployment. A green run verifies sources, not release readiness.
- The historical `tests/security-tools/check-workflow.py` recognizes only the
  original three install prefixes and five gates; its allowlist predates this
  added isolated package. It is not run by the workflow and is not evidence of
  validation of the extended workflow.

Engram is unavailable in this session; this file records the extraction decision,
coverage and limits for recovery.

## Verification (2026-11-25)

- Working tree: **25/25 P0 passed**, no skips/cancellations/todos.
- Clean `git archive 098d3c8` plus only this staged selection, with independent
  `npm ci --ignore-scripts` for all four isolated packages: **25/25 P0 passed**.
- The same clean snapshot passed existing gates: **28 candidate + 14 handlers +
  65 frontend + 15 HTTP runtime**; both readiness dry-runs exited 0. Total with
  P0: **147 passing tests**. Frontend focused TypeScript noEmit/import-closure
  check also passed. No root/functions installation or build was needed.
- Local runtimes: Node **22.16.0**, Java **21** via
  `/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home`, CLI **15.15.0**.
- Active working-tree `firestore.rules` retained SHA-256
  `c24b7c5fb757eeba7ec67e22fc0c5e514332624ae608584a6261e99cc62e276c`.
- Remote CI evidence must match the final commit SHA and be checked separately;
  the local snapshot is not proof of a GitHub run or production behavior.
