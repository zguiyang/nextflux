import { describe, expect, it } from "vitest";
import {
  getFeedParsingErrorMessage,
  hasFeedParsingError,
  mapServerFeedToLocal,
} from "./feedMetadata.js";

const serverFeed = {
  id: 42,
  title: "Example Feed",
  feed_url: "https://example.com/feed.xml",
  site_url: "https://example.com",
  crawler: false,
  hide_globally: false,
  category: { id: 7, title: "News" },
  parsing_error_count: 2,
  parsing_error_message: "invalid character entity",
  scraper_rules: "",
  keeplist_rules: "",
  blocklist_rules: "",
  rewrite_rules: "",
};

describe("feedMetadata", () => {
  it("maps parsing_error_message from Miniflux feed DTO", () => {
    expect(mapServerFeedToLocal(serverFeed)).toMatchObject({
      parsing_error_count: 2,
      parsing_error_message: "invalid character entity",
    });
  });

  it("shows warning when parsing_error_count is greater than zero", () => {
    expect(hasFeedParsingError({ parsing_error_count: 1 })).toBe(true);
    expect(
      hasFeedParsingError({
        parsing_error_count: 1,
        parsing_error_message: "broken xml",
      }),
    ).toBe(true);
  });

  it("hides warning when parsing_error_count is zero", () => {
    expect(
      hasFeedParsingError({
        parsing_error_count: 0,
        parsing_error_message: "",
      }),
    ).toBe(false);
  });

  it("returns the parsing error message when present", () => {
    expect(
      getFeedParsingErrorMessage(
        { parsing_error_message: "broken xml" },
        "fallback",
      ),
    ).toBe("broken xml");
  });

  it("falls back when parsing_error_message is empty", () => {
    expect(
      getFeedParsingErrorMessage(
        { parsing_error_message: "   " },
        "Feed refresh failed recently",
      ),
    ).toBe("Feed refresh failed recently");
  });
});
