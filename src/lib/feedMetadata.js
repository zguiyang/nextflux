export function mapServerFeedToLocal(feed) {
  return {
    id: feed.id,
    title: feed.title,
    url: feed.feed_url,
    site_url: feed.site_url,
    crawler: feed.crawler,
    hide_globally: feed.hide_globally,
    categoryId: feed.category.id,
    parsing_error_count: feed.parsing_error_count,
    parsing_error_message: feed.parsing_error_message || "",
    scraper_rules: feed.scraper_rules,
    keeplist_rules: feed.keeplist_rules,
    blocklist_rules: feed.blocklist_rules,
    rewrite_rules: feed.rewrite_rules,
  };
}

export function hasFeedParsingError(feed) {
  return (feed?.parsing_error_count ?? 0) > 0;
}

export function getFeedParsingErrorMessage(feed, fallback) {
  const message = feed?.parsing_error_message?.trim();
  return message || fallback;
}
