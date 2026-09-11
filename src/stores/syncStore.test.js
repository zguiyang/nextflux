import { beforeEach, describe, expect, it, vi } from "vitest";
import { atom } from "nanostores";

const mockGetFeeds = vi.fn();
const mockGetCategories = vi.fn();

vi.mock("../api/miniflux", () => ({
  default: {
    getFeeds: (...args) => mockGetFeeds(...args),
    getCategories: (...args) => mockGetCategories(...args),
    getChangedEntries: vi.fn().mockResolvedValue([]),
    getNewEntries: vi.fn().mockResolvedValue([]),
    getUnreadEntriesByPage: vi
      .fn()
      .mockResolvedValue({ total: 0, entries: [] }),
    getAllStarredEntries: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../db/storage", () => ({
  getFeeds: vi.fn().mockResolvedValue([]),
  addArticles: vi.fn(),
  deleteArticlesByFeedId: vi.fn(),
  getLastSyncTime: vi.fn().mockReturnValue(new Date("2026-01-01T00:00:00.000Z")),
  setLastSyncTime: vi.fn(),
  addFeeds: vi.fn(),
  addCategory: vi.fn(),
  deleteAllFeeds: vi.fn(),
  deleteAllCategory: vi.fn(),
}));

vi.mock("./settingsStore", () => ({
  settingsState: atom({ syncInterval: 0, showHiddenFeeds: true }),
}));

describe("syncStore feed metadata resync", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetFeeds.mockResolvedValue([]);
    mockGetCategories.mockResolvedValue([]);
  });

  it("persists parsing_error_message during syncFeeds", async () => {
    mockGetFeeds.mockResolvedValue([
      {
        id: 1,
        title: "Broken Feed",
        feed_url: "https://example.com/rss",
        site_url: "https://example.com",
        crawler: false,
        hide_globally: false,
        category: { id: 2, title: "News" },
        parsing_error_count: 3,
        parsing_error_message: "xml syntax error",
        scraper_rules: "",
        keeplist_rules: "",
        blocklist_rules: "",
        rewrite_rules: "",
      },
    ]);

    const { sync, isOnline, __resetSyncStoreForTests } = await import(
      "./syncStore.js"
    );
    __resetSyncStoreForTests();
    isOnline.set(true);

    await sync();

    const { addFeeds } = await import("../db/storage");
    expect(addFeeds).toHaveBeenCalledWith([
      expect.objectContaining({
        parsing_error_count: 3,
        parsing_error_message: "xml syntax error",
      }),
    ]);
  });

  it("queues forceSync while a sync is already running", async () => {
    let releaseSync;
    const syncStarted = new Promise((resolve) => {
      releaseSync = resolve;
    });

    mockGetFeeds.mockImplementation(async () => {
      await syncStarted;
      return [];
    });

    const { sync, forceSync, isOnline, isSyncing, __resetSyncStoreForTests } =
      await import("./syncStore.js");
    __resetSyncStoreForTests();
    isOnline.set(true);

    const runningSync = sync();
    await vi.waitFor(() => {
      expect(isSyncing.get()).toBe(true);
    });

    await forceSync();
    releaseSync();
    await runningSync;

    expect(mockGetFeeds).toHaveBeenCalledTimes(2);
  });

  it("waits for a queued forceSync to finish without polling", async () => {
    let releaseSync;
    const syncStarted = new Promise((resolve) => {
      releaseSync = resolve;
    });

    mockGetFeeds.mockImplementation(async () => {
      await syncStarted;
      return [];
    });

    const {
      sync,
      forceSyncWithWait,
      isOnline,
      isSyncing,
      __resetSyncStoreForTests,
    } = await import("./syncStore.js");
    __resetSyncStoreForTests();
    isOnline.set(true);

    const runningSync = sync();
    await vi.waitFor(() => {
      expect(isSyncing.get()).toBe(true);
    });

    const waitingForceSync = forceSyncWithWait();
    releaseSync();
    await Promise.all([runningSync, waitingForceSync]);

    expect(isSyncing.get()).toBe(false);
    expect(mockGetFeeds).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent forceSyncWithWait callers into one follow-up sync", async () => {
    let releaseSync;
    const syncStarted = new Promise((resolve) => {
      releaseSync = resolve;
    });

    mockGetFeeds.mockImplementation(async () => {
      await syncStarted;
      return [];
    });

    const { sync, forceSyncWithWait, isOnline, isSyncing, __resetSyncStoreForTests } =
      await import("./syncStore.js");
    __resetSyncStoreForTests();
    isOnline.set(true);

    const runningSync = sync();
    await vi.waitFor(() => {
      expect(isSyncing.get()).toBe(true);
    });

    const waiting = Promise.all([forceSyncWithWait(), forceSyncWithWait()]);
    releaseSync();
    await Promise.all([runningSync, waiting]);

    expect(isSyncing.get()).toBe(false);
    expect(mockGetFeeds).toHaveBeenCalledTimes(2);
  });

  it("rejects forceSyncWithWait when the follow-up sync fails", async () => {
    let releaseSync;
    const syncStarted = new Promise((resolve) => {
      releaseSync = resolve;
    });

    mockGetFeeds.mockImplementation(async () => {
      await syncStarted;
      throw new Error("feeds unavailable");
    });

    const {
      sync,
      forceSyncWithWait,
      isOnline,
      isSyncing,
      error,
      __resetSyncStoreForTests,
    } = await import("./syncStore.js");
    __resetSyncStoreForTests();
    isOnline.set(true);

    const runningSync = sync();
    await vi.waitFor(() => {
      expect(isSyncing.get()).toBe(true);
    });

    const waitingForceSync = forceSyncWithWait();
    releaseSync();
    await runningSync;
    await expect(waitingForceSync).rejects.toThrow("feeds unavailable");

    expect(isSyncing.get()).toBe(false);
    expect(error.get()).toBeInstanceOf(Error);
    expect(error.get().message).toBe("feeds unavailable");
  });

  it("rejects forceSyncWithWait when the sync session fails", async () => {
    mockGetFeeds.mockRejectedValue(new Error("feeds unavailable"));

    const { forceSyncWithWait, isOnline, isSyncing, error, __resetSyncStoreForTests } =
      await import("./syncStore.js");
    __resetSyncStoreForTests();
    isOnline.set(true);

    await expect(forceSyncWithWait()).rejects.toThrow("feeds unavailable");

    expect(isSyncing.get()).toBe(false);
    expect(error.get()).toBeInstanceOf(Error);
    expect(error.get().message).toBe("feeds unavailable");
  });
});
