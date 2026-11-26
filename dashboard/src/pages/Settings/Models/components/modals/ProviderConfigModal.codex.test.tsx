import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, expect, it, vi } from "vitest";
import { ProviderConfigModal } from "./ProviderConfigModal";

const fetchModels = vi.fn();
const request = vi.fn();
vi.mock("../../providerApi", () => ({
  fetchProviderModels: (...args: unknown[]) => fetchModels(...args),
  testProviderDraft: vi.fn(),
}));
vi.mock("../../../../../api/request", () => ({
  request: (...args: unknown[]) => request(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue({});
});

it("retains the Codex Responses protocol when fetched models are saved", async () => {
  fetchModels.mockResolvedValue({
    ok: true,
    models: [
      {
        id: "account-model",
        name: "Account model",
        api_mode: "responses",
        api_fallback: "none",
      },
    ],
  });
  const onSaved = vi.fn();
  render(
    <App>
      <ProviderConfigModal
        provider={{
          id: 1,
          name: "openai-codex",
          kind: "openai",
          base_url: "https://chatgpt.com/backend-api/codex",
          api_key: null,
          api_key_set: true,
          note: null,
          enabled: true,
          models: [],
        }}
        open
        apiPrefix="/admin/providers"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    </App>,
  );
  fireEvent.click(screen.getByRole("button", { name: "models.fetchModels" }));
  await waitFor(() => expect(fetchModels).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const body = JSON.parse(request.mock.calls[0][1].body);
  expect(body.models[0]).toMatchObject({
    id: "account-model",
    api_mode: "responses",
    api_fallback: "none",
  });
});
