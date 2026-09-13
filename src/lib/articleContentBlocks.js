const CONTAINER_TAGS = new Set([
  "div",
  "section",
  "article",
  "main",
  "body",
  "ul",
  "ol",
  "dl",
  "figure",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
]);

const LEAF_BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "td",
  "th",
  "figcaption",
  "dd",
  "dt",
]);

const SKIP_STRUCTURE_TAGS = new Set([
  "time",
  "nav",
  "header",
  "footer",
  "aside",
  "script",
  "style",
  "noscript",
]);

const SKIP_TRANSLATION_TAGS = new Set([
  "pre",
  "code",
  "img",
  "video",
  "audio",
  "iframe",
  "picture",
  "svg",
  "source",
  "track",
]);

const METADATA_CLASS_PATTERN =
  /\b(tags?|tag-list|category|categories|meta|breadcrumb|byline|author|posted-on|entry-meta)\b/i;

const LONG_BLOCK_CHAR_LIMIT = 600;
const MIN_SPLIT_CHAR_LIMIT = 400;

const SENTENCE_SPLIT_REGEX = /(?<=[.!?。！？…])\s+/u;

const escapeHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getPlainText = (html) => {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.innerText.replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
};

const wrapAsSafeParagraph = (text) => `<p>${escapeHtml(text)}</p>`;

const isMetadataElement = (element) => {
  const tag = element.tagName?.toLowerCase();
  if (SKIP_STRUCTURE_TAGS.has(tag)) {
    return true;
  }

  const className = element.getAttribute("class") || "";
  const role = element.getAttribute("role") || "";
  if (role === "navigation" || role === "contentinfo" || role === "banner") {
    return true;
  }

  if (!METADATA_CLASS_PATTERN.test(className)) {
    return false;
  }

  const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
  return text.length > 0 && text.length <= 240;
};

const isMediaOnlyElement = (element) => {
  const text = element.textContent?.replace(/\s+/g, "").trim() || "";
  if (text) return false;
  return Boolean(
    element.querySelector("img, video, audio, iframe, picture, svg"),
  );
};

const isNonTranslatableElement = (element) => {
  const tag = element.tagName?.toLowerCase();
  if (SKIP_TRANSLATION_TAGS.has(tag)) {
    return true;
  }
  if (isMediaOnlyElement(element)) {
    return true;
  }
  if (element.closest("pre, code")) {
    return true;
  }
  return false;
};

const splitLongText = (text) => {
  if (text.length <= LONG_BLOCK_CHAR_LIMIT) {
    return [text];
  }

  const sentences = text.split(SENTENCE_SPLIT_REGEX).filter(Boolean);
  if (sentences.length <= 1) {
    if (text.length <= LONG_BLOCK_CHAR_LIMIT * 1.5) {
      return [text];
    }
    const chunks = [];
    for (let index = 0; index < text.length; index += LONG_BLOCK_CHAR_LIMIT) {
      chunks.push(text.slice(index, index + LONG_BLOCK_CHAR_LIMIT));
    }
    return chunks;
  }

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > LONG_BLOCK_CHAR_LIMIT && current.length >= MIN_SPLIT_CHAR_LIMIT) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [text];
};

let blockIdCounter = 0;

const createBlock = (html, text, skipTranslation = false) => ({
  id: `block-${blockIdCounter++}`,
  html,
  text,
  skipTranslation,
  translatedText: "",
  status: skipTranslation ? "done" : "pending",
});

const createTextBlocks = (text, htmlFactory = wrapAsSafeParagraph) => {
  const chunks = splitLongText(text);
  if (chunks.length === 1) {
    return [createBlock(htmlFactory(chunks[0]), chunks[0])];
  }
  return chunks.map((chunk) => createBlock(htmlFactory(chunk), chunk));
};

const collectBlocksFromNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (!text) {
      return [];
    }
    return createTextBlocks(text);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node;
  const tag = element.tagName.toLowerCase();

  if (isMetadataElement(element)) {
    return [];
  }

  if (isNonTranslatableElement(element)) {
    return [createBlock(element.outerHTML, "", true)];
  }

  if (CONTAINER_TAGS.has(tag)) {
    const blocks = [];
    for (const child of element.childNodes) {
      blocks.push(...collectBlocksFromNode(child));
    }
    return blocks;
  }

  if (LEAF_BLOCK_TAGS.has(tag)) {
    const text = getPlainText(element.outerHTML);
    if (!text) {
      return [createBlock(element.outerHTML, "", true)];
    }

    const chunks = splitLongText(text);
    if (chunks.length === 1) {
      return [createBlock(element.outerHTML, text)];
    }

    return chunks.map((chunk) => createBlock(wrapAsSafeParagraph(chunk), chunk));
  }

  const blocks = [];
  for (const child of element.childNodes) {
    blocks.push(...collectBlocksFromNode(child));
  }
  return blocks;
};

export function splitHtmlIntoBlocks(html) {
  if (!html?.trim()) {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [];

  for (const child of doc.body.childNodes) {
    blocks.push(...collectBlocksFromNode(child));
  }

  if (!blocks.length) {
    const text = getPlainText(html);
    if (!text) {
      return [];
    }
    return createTextBlocks(text);
  }

  return blocks;
}

export { getPlainText as getBlockPlainText, escapeHtml, wrapAsSafeParagraph };
