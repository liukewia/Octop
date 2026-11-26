# Dashboard shared state migration

This is the first bounded Zustand migration, not a rewrite of every React hook.
The owning application is `dashboard/` (Octop's web UI, also used by desktop).

## Migrated: expert navigation

`createAgentStore` owns the existing shared expert-list projection, current
selection, fetch status, and stable `refresh` / `setActiveAgent` actions.
`agentData.ts` preserves the existing API mapping, bridge behavior and public
helper exports. API requests still go through `api/`; this is not a second
server-query cache and does not move chat histories or page resources into a
central store.

`AgentProvider` creates a vanilla Zustand store per authenticated user and bridge
permission scope. React context carries only the stable store instance; state
updates are delivered by Zustand. Existing `AgentContext` import paths remain
compatible. All production `useAgent` callers use selectors, for example:

```tsx
const { activeAgentId, refresh } = useAgent((state) => ({
  activeAgentId: state.activeAgentId,
  refresh: state.refresh,
}));
```

The wrapper shallow-compares object picks, so action-only and id-only subscribers
do not redraw when unread counts/loading change. Unchanged JSON records are
structurally shared across polls, including the selected record. Comparing the
complete JSON payload avoids silently dropping config/visibility/owner updates.
`force: true` deliberately replaces references. A property-order-only JSON change
can cause an extra render; it cannot hide a real change.

## Lifecycle and persistence

- Selection is persisted as `octop:active-agent:<userId>`. No expert records,
  authentication tokens, errors, or request results are persisted in Zustand.
- The legacy unscoped `octop:active-agent` value is deliberately **not** adopted:
  it cannot be attributed safely to an account. The first fetch chooses the
  first available expert if the account has no valid saved selection. This
  means a one-time selection reset after upgrade.
- The request-module agent header is applied synchronously before subscribers
  observe the new selection, and cleared when the provider unmounts.
- A user/bridge-permission scope change remounts a fresh store. Cleanup
  invalidates pending requests and stale actions; a response from the previous
  scope cannot repopulate the new account or change its HTTP header.
- Concurrent refreshes use latest-started-wins semantics; the winning request
  always settles loading, including a silent refresh superseding a foreground
  refresh. User selections made during the request are preserved if still valid.
- StrictMode cleanup/reactivation and focus-listener cleanup are covered by tests.

## Deliberately unchanged / remaining review

Theme/layout preferences, auth-provider wiring, scroll/voice/backup/restart
resource contexts, route-local state, form drafts, and the custom streaming chat
store are unchanged. Resource/service contexts are not automatically candidates
for Zustand merely because they use context. Chat streaming state needs its own
bounded migration and regression plan; moving it into this navigation store
would couple high-frequency updates to unrelated screens.

No model-provider, login-policy, notifications, backend RBAC, or API contract
feature is introduced by this migration. End-to-end desktop/live-server checks
remain necessary before release; jsdom tests do not exercise native WebViews.
