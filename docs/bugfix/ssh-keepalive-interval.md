# SSH keepalive every 3.6 seconds

| Type | Severity | Status | Source | Depends on |
|---|---|---|---|---|
| Bugfix | 🟡 | finished | [performance.md P14](../improvements/performance.md#p14--ssh-keepalive-every-36-seconds) | – |


# Current situation

[SSH_Tasks.ts:109-115](../../src/extension/utilities/SSH_Tasks.ts#L109-L115) connects with `keepaliveInterval: 3600`. ssh2 interprets the value in **milliseconds**, so a keepalive packet is sent every 3.6 s for the whole session. `readyTimeout` is not set (ssh2 default 20 s).


# Fix

1. Add constants to [Constants.ts](../../src/shared/Constants.ts):
   ```ts
   public static readonly SSH_KEEPALIVE_INTERVAL_MS: number = 60_000;
   public static readonly SSH_KEEPALIVE_COUNT_MAX: number = 3;
   public static readonly SSH_READY_TIMEOUT_MS: number = 30_000;
   ```
2. Extract the connect options into a small function so they can be tested:
   ```ts
   public static build_connect_config(host: string, user: string, pwd: string | undefined, key: string | undefined): Config
   ```
   and pass `keepaliveInterval`, `keepaliveCountMax` and `readyTimeout` from the constants. [ssh-authentication-options.md](../features/ssh-authentication-options.md) and [ssh-host-key-verification.md](../features/ssh-host-key-verification.md) extend the same function later.


# Tests

* Unit test: `build_connect_config(...)` returns `keepaliveInterval === 60000` and `readyTimeout === 30000`.


### Definition of done
* Keepalive interval is 60 s, count max 3, ready timeout 30 s
* Connect options are built in one testable function
* CHANGELOG entry
