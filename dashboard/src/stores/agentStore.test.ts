import { describe, expect, it, vi } from "vitest";
import { createAgentStore } from "./agentStore";
import type { FetchAgentsResult, OctopAgent } from "./agentData";

function agent(id: string, overrides: Partial<OctopAgent> = {}): OctopAgent {
  return {
    id: 0,
    agent_id: id,
    name: id,
    description: null,
    persona_mbti: null,
    default_model: null,
    system_prompt: null,
    template_name: null,
    state: "running",
    last_error: null,
    icon: null,
    icon_name: null,
    icon_url: null,
    color: null,
    config: {},
    ...overrides,
  };
}

function result(...agents: OctopAgent[]): FetchAgentsResult {
  return {
    agents,
    liveConnectionIds: new Set(),
    resolvedConnectionIds: new Set(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup() {
  const deps = {
    fetchAgents: vi.fn(async () => result(agent("a"), agent("b"))),
    readSelection: vi.fn((): string | null => "b"),
    writeSelection: vi.fn(),
    applySelection: vi.fn(),
  };
  return { store: createAgentStore(deps), deps };
}

describe("agent Zustand store", () => {
  it("restores only a valid selection and synchronizes API scope before subscribers", async () => {
    const { store, deps } = setup();
    store.subscribe((state) => {
      if (state.activeAgentId)
        expect(deps.applySelection).toHaveBeenLastCalledWith(
          state.activeAgentId,
        );
    });
    await store.getState().refresh();
    expect(store.getState().activeAgent?.agent_id).toBe("b");
    expect(deps.writeSelection).toHaveBeenLastCalledWith("b");
    deps.readSelection.mockReturnValue("missing");
    store.getState().setActiveAgent(null);
    await store.getState().refresh();
    expect(store.getState().activeAgentId).toBe("a");
    deps.fetchAgents.mockResolvedValue(result());
    await store.getState().refresh();
    expect(store.getState().activeAgent).toBeNull();
    expect(deps.applySelection).toHaveBeenLastCalledWith(null);
  });

  it("retains list and record references on unchanged polls; force really replaces them", async () => {
    const { store } = setup();
    await store.getState().refresh();
    const initial = store.getState();
    await store.getState().refresh({ silent: true });
    expect(store.getState().agents).toBe(initial.agents);
    expect(store.getState().activeAgent).toBe(initial.activeAgent);
    expect(store.getState().refresh).toBe(initial.refresh);
    await store.getState().refresh({ force: true });
    expect(store.getState().agents).not.toBe(initial.agents);
  });

  it("keeps the active record stable when only a different agent changes", async () => {
    const { store, deps } = setup();
    await store.getState().refresh();
    const active = store.getState().activeAgent;
    deps.fetchAgents.mockResolvedValue(
      result(agent("a", { unread_count: 9 }), agent("b")),
    );
    await store.getState().refresh({ silent: true });
    expect(store.getState().agents[0].unread_count).toBe(9);
    expect(store.getState().activeAgent).toBe(active);
  });

  it("does not hide config or ownership details outside the old snapshot field subset", async () => {
    const { store, deps } = setup();
    await store.getState().refresh();
    deps.fetchAgents.mockResolvedValue(
      result(
        agent("a"),
        agent("b", {
          owner_username: "new-owner",
          description: "updated",
          config: { conversation_mode: "plan" },
        }),
      ),
    );
    await store.getState().refresh({ silent: true });
    expect(store.getState().activeAgent).toMatchObject({
      owner_username: "new-owner",
      description: "updated",
      config: { conversation_mode: "plan" },
    });
  });

  it("retains a selected bridge expert during disconnect, but removes it after link deletion", async () => {
    const { store, deps } = setup();
    const remote = agent("bridge:link:peer", {
      bridge: true,
      bridge_connection_id: "link",
    });
    deps.readSelection.mockReturnValue(remote.agent_id);
    deps.fetchAgents.mockResolvedValue({
      ...result(agent("a"), remote),
      liveConnectionIds: new Set(["link"]),
    });
    await store.getState().refresh();
    deps.fetchAgents.mockResolvedValue({
      ...result(agent("a")),
      liveConnectionIds: new Set(["link"]),
    });
    await store.getState().refresh({ silent: true });
    expect(store.getState().activeAgent).toMatchObject({
      agent_id: remote.agent_id,
      bridge_disconnected: true,
    });
    deps.fetchAgents.mockResolvedValue(result(agent("a")));
    await store.getState().refresh({ silent: true });
    expect(store.getState().activeAgentId).toBe("a");
    expect(store.getState().agents).toHaveLength(1);
  });

  it("does not overwrite a selection made while refreshing", async () => {
    const { store, deps } = setup();
    await store.getState().refresh();
    const pending = deferred<FetchAgentsResult>();
    deps.fetchAgents.mockReturnValue(pending.promise);
    const refresh = store.getState().refresh();
    store.getState().setActiveAgent("a");
    pending.resolve(result(agent("a"), agent("b")));
    await refresh;
    expect(store.getState().activeAgentId).toBe("a");
  });

  it("ignores out-of-order results and clears loading when a silent refresh wins", async () => {
    const { store, deps } = setup();
    const first = deferred<FetchAgentsResult>();
    const second = deferred<FetchAgentsResult>();
    deps.fetchAgents
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const old = store.getState().refresh();
    const latest = store.getState().refresh({ silent: true });
    second.resolve(result(agent("new")));
    await latest;
    first.resolve(result(agent("old")));
    await old;
    expect(store.getState().activeAgentId).toBe("new");
    expect(store.getState().loading).toBe(false);
  });

  it("retains a good selection on failure and exposes the fetch error", async () => {
    const { store, deps } = setup();
    await store.getState().refresh();
    deps.fetchAgents.mockRejectedValue(new Error("offline"));
    await store.getState().refresh();
    expect(store.getState()).toMatchObject({
      activeAgentId: "b",
      error: "offline",
      loading: false,
    });
  });

  it("disposal invalidates pending results and stale actions without leaking into a new account", async () => {
    const { store, deps } = setup();
    const pending = deferred<FetchAgentsResult>();
    deps.fetchAgents.mockReturnValueOnce(pending.promise);
    const refresh = store.getState().refresh();
    store.dispose();
    deps.applySelection.mockClear();
    pending.resolve(result(agent("private-old-user")));
    await refresh;
    store.getState().setActiveAgent("private-old-user");
    expect(store.getState().agents).toEqual([]);
    expect(deps.applySelection).not.toHaveBeenCalled();
    expect(deps.writeSelection).not.toHaveBeenCalled();
    const other = setup().store;
    expect(other.getState().activeAgentId).toBeNull();
    // React StrictMode can reactivate the same instance after effect cleanup.
    store.activate();
    await store.getState().refresh();
    expect(store.getState().activeAgentId).toBe("b");
  });
});
