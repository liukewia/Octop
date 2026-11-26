import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { setActiveAgentId } from "../api/request";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { userCan } from "../utils/permissions";
import { fetchAgents, type AgentState } from "../stores/agentData";
import { createAgentStore } from "../stores/agentStore";

// Keep domain types/helpers and existing imports compatible during migration.
export * from "../stores/agentData";

const AgentContext = createContext<ReturnType<typeof createAgentStore> | null>(
  null,
);
const emptyStore = createAgentStore({
  fetchAgents: async () => ({
    agents: [],
    liveConnectionIds: new Set(),
    resolvedConnectionIds: new Set(),
  }),
  readSelection: () => null,
  writeSelection: () => {},
  applySelection: () => {},
});
emptyStore.setState({ loading: false });

function ScopedAgentProvider({
  children,
  userId,
  includeBridge,
}: {
  children: ReactNode;
  userId: number | null;
  includeBridge: boolean;
}) {
  const [store] = useState(() => {
    // Never adopt the old unscoped selection left by a different account.
    const key = `octop:active-agent:${userId ?? "anonymous"}`;
    return createAgentStore({
      fetchAgents: () => fetchAgents(includeBridge),
      readSelection: () => localStorage.getItem(key),
      writeSelection: (id) => {
        if (id) localStorage.setItem(key, id);
        else localStorage.removeItem(key);
      },
      applySelection: setActiveAgentId,
    });
  });

  useLayoutEffect(() => {
    store.activate();
    return () => store.dispose();
  }, [store]);

  useEffect(() => {
    void store.getState().refresh();
    const onFocus = () => void store.getState().refresh({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [store]);

  return (
    <AgentContext.Provider value={store}>{children}</AgentContext.Provider>
  );
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const includeBridge = userCan(user, "bridge");
  return (
    <ScopedAgentProvider
      key={`${user?.id ?? "anonymous"}:${includeBridge}`}
      userId={user?.id ?? null}
      includeBridge={includeBridge}
    >
      {children}
    </ScopedAgentProvider>
  );
}

const identity = (state: AgentState) => state;

/** Subscribe only to the fields a component reads. Object picks are shallow-compared. */
export function useAgent<T = AgentState>(
  selector: (state: AgentState) => T = identity as (state: AgentState) => T,
): T {
  const store = useContext(AgentContext) ?? emptyStore;
  return useStore(store, useShallow(selector));
}
