import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefreshFeed = vi.fn();
const mockForceSyncWithWait = vi.fn();

vi.mock("@/api/miniflux.js", () => ({
  default: {
    refreshFeed: (...args) => mockRefreshFeed(...args),
  },
}));

vi.mock("@/stores/syncStore.js", () => ({
  forceSyncWithWait: (...args) => mockForceSyncWithWait(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    promise: (promise) => promise,
  },
}));

vi.mock("i18next", () => ({
  default: {
    t: (key) => key,
  },
}));

describe("handleRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshFeed.mockResolvedValue(undefined);
    mockForceSyncWithWait.mockResolvedValue(undefined);
  });

  it("refreshes the feed on the server then waits for a full local sync", async () => {
    const { handleRefresh } = await import("./feedHandlers.jsx");
    const callOrder = [];

    mockRefreshFeed.mockImplementation(async () => {
      callOrder.push("refresh");
    });
    mockForceSyncWithWait.mockImplementation(async () => {
      callOrder.push("forceSync");
    });

    await handleRefresh(12);

    expect(callOrder).toEqual(["refresh", "forceSync"]);
  });

  it("does not force-sync when refresh API fails", async () => {
    mockRefreshFeed.mockRejectedValue(new Error("refresh failed"));

    const { handleRefresh } = await import("./feedHandlers.jsx");

    await expect(handleRefresh(12)).rejects.toThrow("refresh failed");
    expect(mockForceSyncWithWait).not.toHaveBeenCalled();
  });

  it("propagates sync failure so refresh toast can show error", async () => {
    mockForceSyncWithWait.mockRejectedValue(new Error("feeds unavailable"));

    const { handleRefresh } = await import("./feedHandlers.jsx");

    await expect(handleRefresh(12)).rejects.toThrow("feeds unavailable");
    expect(mockRefreshFeed).toHaveBeenCalledWith(12);
  });
});
