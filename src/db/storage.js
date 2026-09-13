import Dexie from "dexie";

// 创建数据库
const db = new Dexie("minifluxReader");

// 创建表及索引
db.version(11).stores({
  articles:
    "id, feedId, status, starred, created_at, [status+feedId], [starred+feedId]",
  categories: "id, title",
  feeds: "id, url",
  feedIcons: "feedId",
});

db.version(12).stores({
  articles:
    "id, feedId, status, starred, created_at, [status+feedId], [starred+feedId]",
  categories: "id, title",
  feeds: "id, url",
  feedIcons: "feedId",
  bilingualTranslations: "cacheKey, articleId, targetLanguage, lastAccessAt",
});

db.open().catch((err) => {
  console.error("打开数据库失败:", err);
  // 如果是版本升级错误，尝试删除数据库并重新创建
  if (err.name === "VersionError" || err.name === "UpgradeError") {
    return db.delete().then(() => {
      console.log("数据库已重置");
      window.location.reload(); // 刷新页面重新初始化数据库
    });
  }
});

// 添加订阅源
async function addFeeds(feeds) {
  return db.feeds.bulkPut(feeds);
}

// 获取所有订阅源
async function getFeeds() {
  return db.feeds.toArray();
}

// 清空全部订阅源
async function deleteAllFeeds() {
  return db.feeds.clear();
}

// 删除指定的订阅源
async function deleteFeed(feedId) {
  return db.feeds.delete(feedId);
}

// 删除指定的订阅源图标
async function deleteFeedIcon(feedId) {
  return db.feedIcons.delete(feedId);
}

// 添加分类
async function addCategory(category) {
  return db.categories.put(category);
}

// 获取所有分类
async function getCategories() {
  return db.categories.toArray();
}

// 删除分类
async function deleteAllCategory() {
  return db.categories.clear();
}

// 删除单个分类
async function deleteCategory(categoryId) {
  return db.categories.delete(categoryId);
}

// 更新分类
async function updateCategory(categoryId, title) {
  return db.categories.update(categoryId, { title });
}

// 存储上次同步时间
function setLastSyncTime(time) {
  localStorage.setItem("lastSyncTime", time.toISOString());
}

// 获取上次同步时间
function getLastSyncTime() {
  const time = localStorage.getItem("lastSyncTime");
  return time ? new Date(time) : null;
}

// 批量添加文章
async function addArticles(articles) {
  return db.articles.bulkPut(articles);
}

// 删除指定源的全部文章
async function deleteArticlesByFeedId(feedId) {
  return db.articles.where("feedId").equals(feedId).delete();
}

// 获取订阅源未读文章数量
async function getUnreadCount(feedId) {
  return db.articles
    .where(["status", "feedId"])
    .equals(["unread", feedId])
    .count();
}

// 获取订阅源收藏文章数量
async function getStarredCount(feedId) {
  return db.articles.where(["starred", "feedId"]).equals([1, feedId]).count();
}

// 获取文章总数
async function getArticlesCount(feedIds, filter = "all") {
  let query;

  switch (filter) {
    case "unread":
      query = db.articles
        .where("feedId")
        .anyOf(feedIds)
        .and((article) => article.status === "unread");
      break;
    case "starred":
      query = db.articles
        .where("feedId")
        .anyOf(feedIds)
        .and((article) => article.starred === 1);
      break;
    default:
      query = db.articles
        .where("feedId")
        .anyOf(feedIds)
        .and((article) => article.status !== "removed");
      break;
  }

  return query.count();
}

// 分页获取文章
async function getArticlesByPage(
  feedIds,
  filter = "all",
  page = 1,
  pageSize = 30,
  sortDirection = "desc",
  sortField = "published_at",
) {
  const offset = (page - 1) * pageSize;

  // 创建基础查询
  let collection;

  // 先应用过滤条件
  switch (filter) {
    case "unread":
      collection = db.articles
        .where("status")
        .equals("unread")
        .and((article) => feedIds.includes(article.feedId));
      break;
    case "starred":
      collection = db.articles
        .where("starred")
        .equals(1)
        .and((article) => feedIds.includes(article.feedId));
      break;
    default:
      collection = db.articles
        .where("feedId")
        .anyOf(feedIds)
        .and((article) => article.status !== "removed");
  }

  // 在过滤后的结果上进行排序
  collection = collection.sortBy(sortField);

  // 如果需要倒序，则反转结果
  return sortDirection === "desc"
    ? (await collection).reverse().slice(offset, offset + pageSize)
    : (await collection).slice(offset, offset + pageSize);
}

// 获取文章详情
async function getArticleById(id) {
  const article = await db.articles.get(parseInt(id));

  if (!article) {
    return null;
  }

  // 获取文章对应的订阅源
  const feed = await db.feeds.get(article.feedId);

  return {
    ...article,
    feed: feed,
  };
}

async function searchArticles(keyword, showHiddenFeeds = false, sortField = "published_at") {
  try {
    // 获取可见的订阅源ID
    const feeds = await db.feeds.toArray();
    const visibleFeedIds = feeds
      .filter((feed) => showHiddenFeeds || !feed.hide_globally)
      .map((feed) => feed.id);

    const articles = await db.articles
      .where("feedId")
      .anyOf(visibleFeedIds)
      .filter(
        (article) =>
          article.title &&
          article.title.toLowerCase().includes(keyword.toLowerCase()),
      )
      .sortBy(sortField);

    return articles.reverse();
  } catch (error) {
    console.error("搜索文章失败:", error);
    throw error;
  }
}

// 获取订阅源图标
async function getFeedIcon(feedId) {
  return db.feedIcons.get(feedId);
}

// 存储订阅源图标
async function setFeedIcon(feedIcon) {
  return db.feedIcons.put({
    ...feedIcon,
    updated_at: new Date().toISOString(),
  });
}

const BILINGUAL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BILINGUAL_CACHE_MAX_ENTRIES = 100;
const BILINGUAL_CACHE_MAX_BYTES = 50 * 1024 * 1024;
const BILINGUAL_CACHE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BILINGUAL_CACHE_CLEANUP_KEY = "bilingualTranslationCacheLastCleanup";
let bilingualCacheMaintenancePromise = null;

const estimateTranslationCacheSize = (entry) =>
  JSON.stringify(entry.blocks || []).length * 2;

export const getBilingualTranslationCache = async (cacheKey, sourceHash) => {
  try {
    const entry = await db.bilingualTranslations.get(cacheKey);

    if (!entry || entry.sourceHash !== sourceHash) {
      return null;
    }

    void db.bilingualTranslations
      .update(cacheKey, { lastAccessAt: Date.now() })
      .catch(() => {});

    return entry;
  } catch {
    return null;
  }
};

export const saveBilingualTranslationCache = async (entry) => {
  try {
    const now = Date.now();
    const previous = await db.bilingualTranslations.get(entry.cacheKey);
    const record = {
      ...entry,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      lastAccessAt: now,
      sizeBytes: estimateTranslationCacheSize(entry),
    };

    await db.bilingualTranslations.put(record);
    scheduleBilingualTranslationCacheMaintenance();
  } catch {
    // Cache failures must never affect the reading or translation flow.
  }
};

const scheduleBilingualTranslationCacheMaintenance = () => {
  if (bilingualCacheMaintenancePromise) return;

  bilingualCacheMaintenancePromise = cleanupBilingualTranslationCache()
    .catch(() => {})
    .finally(() => {
      bilingualCacheMaintenancePromise = null;
    });
};

export const cleanupBilingualTranslationCache = async () => {
  const cutoff = Date.now() - BILINGUAL_CACHE_TTL_MS;

  await db.bilingualTranslations.where("lastAccessAt").below(cutoff).delete();

  const entries = await db.bilingualTranslations
    .orderBy("lastAccessAt")
    .toArray();
  let totalBytes = entries.reduce(
    (total, entry) => total + (entry.sizeBytes || estimateTranslationCacheSize(entry)),
    0,
  );

  while (
    entries.length > BILINGUAL_CACHE_MAX_ENTRIES ||
    totalBytes > BILINGUAL_CACHE_MAX_BYTES
  ) {
    const oldest = entries.shift();
    if (!oldest) break;
    totalBytes -= oldest.sizeBytes || estimateTranslationCacheSize(oldest);
    await db.bilingualTranslations.delete(oldest.cacheKey);
  }
};

export const scheduleBilingualTranslationCacheCleanup = () => {
  const runCleanup = () => {
    const now = Date.now();
    const lastCleanup = Number(
      localStorage.getItem(BILINGUAL_CACHE_CLEANUP_KEY) || 0,
    );

    if (now - lastCleanup < BILINGUAL_CACHE_CLEANUP_INTERVAL_MS) {
      return;
    }

    void cleanupBilingualTranslationCache()
      .then(() => {
        localStorage.setItem(BILINGUAL_CACHE_CLEANUP_KEY, String(now));
      })
      .catch(() => {});
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(runCleanup, { timeout: 5000 });
  } else {
    setTimeout(runCleanup, 1000);
  }
};

export {
  addFeeds,
  getFeeds,
  deleteAllFeeds,
  deleteFeed,
  deleteFeedIcon,
  addCategory,
  getCategories,
  deleteAllCategory,
  deleteCategory,
  updateCategory,
  setLastSyncTime,
  getLastSyncTime,
  addArticles,
  deleteArticlesByFeedId,
  getUnreadCount,
  getStarredCount,
  getArticlesCount,
  getArticlesByPage,
  getArticleById,
  searchArticles,
  getFeedIcon,
  setFeedIcon,
};
