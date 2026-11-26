import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProvider, useAgent } from "./AgentContext";
import { getActiveAgentId } from "../api/request";
import type { OctopAgent } from "../stores/agentData";

const mocks = vi.hoisted(() => ({
  userId: 1,
  list: vi.fn(),
  actions: vi.fn(),
  selection: vi.fn(),
  records: vi.fn(),
}));
vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ id: mocks.userId, role: "user", permissions: [] }),
}));
vi.mock("../api/modules/agent", () => ({ agentApi: { list: mocks.list } }));

function agent(id: string, unread_count = 0) {
  return {
    agent_id: id,
    name: id,
    state: "running",
    unread_count,
  } as OctopAgent;
}

function Actions() {
  const { refresh } = useAgent((s) => ({ refresh: s.refresh }));
  mocks.actions();
  return (
    <button onClick={() => void refresh({ silent: true })}>refresh</button>
  );
}
function Selection() {
  const { activeAgentId, setActiveAgent } = useAgent((s) => ({
    activeAgentId: s.activeAgentId,
    setActiveAgent: s.setActiveAgent,
  }));
  mocks.selection();
  return (
    <button onClick={() => setActiveAgent("b")}>
      selected:{activeAgentId ?? "none"}
    </button>
  );
}
function Records() {
  const { agents } = useAgent((s) => ({ agents: s.agents }));
  mocks.records();
  return <span>unread:{agents[0]?.unread_count ?? 0}</span>;
}
function App() {
  return (
    <AgentProvider>
      <Actions />
      <Selection />
      <Records />
    </AgentProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.userId = 1;
  mocks.list.mockResolvedValue([agent("a"), agent("b")]);
});
afterEach(cleanup);

describe("AgentProvider Zustand integration", () => {
  it("shares updates across components without re-rendering action/id-only subscribers", async () => {
    render(<App />);
    await screen.findByText("selected:a");
    const actions = mocks.actions.mock.calls.length;
    const selection = mocks.selection.mock.calls.length;
    const records = mocks.records.mock.calls.length;
    mocks.list.mockResolvedValue([agent("a", 3), agent("b")]);
    await act(async () => screen.getByText("refresh").click());
    expect(screen.getByText("unread:3")).toBeInTheDocument();
    expect(mocks.records.mock.calls.length).toBeGreaterThan(records);
    expect(mocks.actions).toHaveBeenCalledTimes(actions);
    expect(mocks.selection).toHaveBeenCalledTimes(selection);
    act(() => screen.getByText("selected:a").click());
    expect(screen.getByText("selected:b")).toBeInTheDocument();
    expect(getActiveAgentId()).toBe("b");
    expect(localStorage.getItem("octop:active-agent:1")).toBe("b");
  });

  it("does not reuse another account's persisted selection or pending response", async () => {
    localStorage.setItem("octop:active-agent", "legacy-private");
    localStorage.setItem("octop:active-agent:1", "b");
    let resolveOld!: (agents: OctopAgent[]) => void;
    mocks.list.mockReturnValueOnce(
      new Promise<OctopAgent[]>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const view = render(<App />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.userId = 2;
    mocks.list.mockResolvedValue([agent("new-account")]);
    view.rerender(<App />);
    await screen.findByText("selected:new-account");
    await act(async () => resolveOld([agent("private-old-account")]));
    expect(screen.getByText("selected:new-account")).toBeInTheDocument();
    expect(getActiveAgentId()).toBe("new-account");
    expect(localStorage.getItem("octop:active-agent:1")).toBe("b");
    expect(localStorage.getItem("octop:active-agent:2")).toBe("new-account");
    view.unmount();
    expect(getActiveAgentId()).toBeNull();
  });

  it("survives StrictMode cleanup and refreshes on focus", async () => {
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText("selected:a");
    mocks.list.mockResolvedValue([agent("focused")]);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(screen.getByText("selected:focused")).toBeInTheDocument();
    view.unmount();
    mocks.list.mockClear();
    window.dispatchEvent(new Event("focus"));
    expect(mocks.list).not.toHaveBeenCalled();
    expect(getActiveAgentId()).toBeNull();
  });
});
