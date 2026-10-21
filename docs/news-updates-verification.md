# CodexOshi update checks

As of 0.3.8 (2026-10-21), settings offer release updates only. The Tibo reset-announcement card, parser, timeline reader, notifications and IPC access have been removed. Old announcement cache entries are ignored. Automatic-update-check preferences are preserved.

Release checks read the latest published stable GitHub release every six hours while active. Manual checks retain a one-minute cooldown. Rate limits honor Retry-After with at least a 30-minute backoff. Cached release information and notification deduplication survive restarts. Network responses after shutdown are discarded.

Only the fixed GitHub repository API and repository link are allowed. Requests omit credentials, reject redirects and limit responses to 2 MiB. A private-repository 404 may use the existing GitHub CLI login without reading its token.

Account quota reads, reset countdowns, reset-credit data, dialogue, portraits and appearance preferences are unchanged by this removal.

Validation: public-news.test.cjs and updates-only.test.cjs cover version reads, timezones, cache migration, IPC/link rejection, polling, saved preferences, notification deduplication, cooldown/backoff, shutdown and response limits. news-ui-smoke.cjs exercises the hidden real Electron renderer with isolated data and synthetic network/notification/update boundaries, including both languages and update progress/failure/restart recovery.
