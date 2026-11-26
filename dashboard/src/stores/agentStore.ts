import { createStore } from "zustand/vanilla";
import { retainDisconnectedBridgeAgents } from "../utils/remoteExpert";
import type { AgentState, FetchAgentsResult } from "./agentData";

interface AgentStoreDependencies {
  fetchAgents: () => Promise<FetchAgentsResult>;
  readSelection: () => string | null;
  writeSelection: (id: string | null) => void;
  applySelection: (id: string | null) => void;
}

/** One store per authenticated provider, not a module-global user-data cache. */
export function createAgentStore(deps: AgentStoreDependencies) {
  let generation = 0;
  let active = true;
  const store = createStore<AgentState>()((set, get) => ({
    agents: [],
    activeAgentId: null,
    activeAgent: null,
    loading: true,
    error: null,
    setActiveAgent: (id) => {
      if (!active) return;
      deps.writeSelection(id);
      // Apply synchronously, before subscribers can issue agent-scoped requests.
      deps.applySelection(id);
      set({
        activeAgentId: id,
        activeAgent: get().agents.find((a) => a.agent_id === id) ?? null,
      });
    },
    refresh: async (options) => {
      if (!active) return;
      const request = ++generation;
      set({ loading: !options?.silent || get().loading, error: null });
      try {
        const result = await deps.fetchAgents();
        // Logout/account changes and newer refreshes invalidate pending results.
        if (!active || request !== generation) return;
        const prev = get().agents;
        const merged = retainDisconnectedBridgeAgents(
          prev,
          result.agents,
          result.liveConnectionIds,
          result.resolvedConnectionIds,
        );
        // Keep unchanged records stable too: another expert's unread badge
        // should not re-render components selecting only the active record.
        const previousById = new Map(
          prev.map((agent) => [agent.agent_id, agent]),
        );
        const shared = options?.force
          ? merged
          : merged.map((agent) => {
              const old = previousById.get(agent.agent_id);
              // Agent records are JSON API payloads. Compare the whole record, not
              // a hand-picked field list that could hide config/permission changes.
              return old && JSON.stringify(old) === JSON.stringify(agent)
                ? old
                : agent;
            });
        const agents =
          !options?.force &&
          prev.length === shared.length &&
          prev.every((agent, i) => agent === shared[i])
            ? prev
            : shared;
        // Read at completion: a selection made during the fetch must win.
        const selected = get().activeAgentId ?? deps.readSelection();
        const id = agents.some((a) => a.agent_id === selected)
          ? selected
          : agents[0]?.agent_id ?? null;
        deps.writeSelection(id);
        deps.applySelection(id);
        set({
          agents,
          activeAgentId: id,
          activeAgent: agents.find((a) => a.agent_id === id) ?? null,
        });
      } catch (err) {
        if (active && request === generation) {
          set({
            error: err instanceof Error ? err.message : "Failed to load agents",
          });
        }
      } finally {
        if (active && request === generation) set({ loading: false });
      }
    },
  }));

  return Object.assign(store, {
    activate: () => {
      active = true;
      deps.applySelection(store.getState().activeAgentId);
    },
    dispose: () => {
      active = false;
      ++generation;
      deps.applySelection(null);
    },
  });
}
