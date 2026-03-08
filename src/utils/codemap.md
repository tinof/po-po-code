# src/utils/

Helper utilities shared across the OpenCode CLI, focused on agent configuration, TMUX orchestration, generic polling, logging, and platform-aware tooling like ZIP extraction.

## Responsibility

Provide durable, low-level services that other features lean on: resolving agent variants from plugin config, managing TMUX panes and layouts, backing a reusable polling strategy, writing trace logs to a temp file, and extracting ZIP archives in a cross-platform way.

## Design

Each helper lives in its own module and re-exports through `src/utils/index.ts`, keeping public surface area flat. Key ideas include memoized state (cached TMUX path, server availability cache, stored layouts), configuration defaults fed from `../config` constants, defensive guards (abort checks, empty-string variants), and layered platform detection (Windows build/tar, PowerShell fallbacks). Logging is best-effort: synchronous file append inside a try/catch so it never throws upstream.

## Flow

Agent variant helpers normalize names, read `PluginConfig.agents`, trim/validate variants, and only mutate request bodies when a variant is missing; `log` simply timestamps and appends strings to a temp file. `pollUntilStable` loops with configurable intervals, fetch callbacks, and stability guards, honoring max time and abort signals before returning a typed `PollResult`. TMUX helpers scan for the binary (`which/where`), cache the result, verify layouts, spawn panes with `opencode attach`, reapply stored layouts on close, and guard against missing servers by checking `/health`. `extractZip` detects the OS (tar on modern Windows, pwsh/powershell fallback) before spawning native unpack commands and bubbling errors when processes fail.

## Integration

Imported wherever safe, reusable utilities are needed: agent variant helpers are used by CLI commands that build request payloads, polling is shared by logic that waits for stable responses, TMUX orchestration ties into session management to open/close panes, `log` is consumed across modules for diagnostics, and `extractZip` supports tooling that unpacks bundles. The folder’s re-exports let features import everything from `src/utils`, which keeps higher-level modules free of implementation detail changes here.
