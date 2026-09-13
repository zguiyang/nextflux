// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  splitHtmlIntoBlocks,
  wrapAsSafeParagraph,
} from "./articleContentBlocks.js";

describe("splitHtmlIntoBlocks", () => {
  it("splits nested div containers into leaf paragraph blocks", () => {
    const blocks = splitHtmlIntoBlocks(
      "<div><p>First paragraph.</p><p>Second paragraph.</p></div>",
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe("First paragraph.");
    expect(blocks[1].text).toBe("Second paragraph.");
  });

  it("captures top-level text nodes as blocks", () => {
    const blocks = splitHtmlIntoBlocks("Leading text<p>Paragraph</p>");

    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0].text).toBe("Leading text");
    expect(blocks.at(-1).text).toBe("Paragraph");
  });

  it("filters time and metadata-like elements", () => {
    const blocks = splitHtmlIntoBlocks(
      '<time datetime="2024-01-01">2024-01-01</time><p>Body text here.</p><div class="tag-list">tag-a tag-b</div>',
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("Body text here.");
  });

  it("skips code and media blocks without translating them", () => {
    const blocks = splitHtmlIntoBlocks(
      '<pre><code>const x = 1;</code></pre><p><img src="https://example.com/a.png" alt=""></p><p>Readable text.</p>',
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[0].skipTranslation).toBe(true);
    expect(blocks[1].skipTranslation).toBe(true);
    expect(blocks[2].text).toBe("Readable text.");
  });

  it("splits long paragraphs by sentence boundaries", () => {
    const longText = `${"A".repeat(450)}. ${"B".repeat(450)}.`;
    const blocks = splitHtmlIntoBlocks(`<p>${longText}</p>`);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.text.length <= 701)).toBe(true);
  });

  it("escapes unsafe text when wrapping split chunks as paragraphs", () => {
    const unsafe = '<script>alert("x")</script>';
    const html = wrapAsSafeParagraph(unsafe);

    expect(html).toBe(
      `<p>${escapeHtml(unsafe)}</p>`,
    );
    expect(html).not.toContain("<script>");
  });
});
