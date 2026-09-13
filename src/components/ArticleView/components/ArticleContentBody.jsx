import parse from "html-react-parser";
import ArticleImage from "@/components/ArticleView/components/ArticleImage.jsx";
import CodeBlock from "@/components/ArticleView/components/CodeBlock.jsx";
import Iframe from "@/components/ArticleView/components/Iframe.jsx";
import { Chip, Link } from "@heroui/react";
import { getHostname } from "@/lib/utils.js";

const handleLinkWithImg = (domNode) => {
  const imgNodes = domNode.children.filter(
    (child) => child.type === "tag" && child.name === "img",
  );

  if (imgNodes.length > 0) {
    const hostname = getHostname(domNode.attribs.href);
    return (
      <>
        {imgNodes.map((imgNode, index) => (
          <ArticleImage imgNode={imgNode} key={imgNode.attribs?.src || index} />
        ))}
        <div className="flex justify-center">
          <Chip color="accent" variant="soft" className="cursor-pointer my-2">
            <a
              href={domNode.attribs.href}
              className="border-none!"
              rel="noopener noreferrer"
              target="_blank"
            >
              {hostname}
            </a>
            <Link.Icon />
          </Chip>
        </div>
      </>
    );
  }
  return domNode;
};

const getTextContent = (node) => {
  if (!node) return "";
  if (node.type === "text") return node.data;
  if (node.type === "tag") {
    if (node.name === "br") return "\n";
    const childText = node.children.map((child) => getTextContent(child)).join("");
    if (
      ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.name)
    ) {
      return `${childText}\n`;
    }
    return childText;
  }
  return "";
};

const hasBlockContent = (node) => {
  if (!node.children) return false;
  return node.children.some((child) => {
    if (child.type !== "tag") return false;
    if (child.name === "img") return true;
    if (child.name === "a") return hasBlockContent(child);
    return false;
  });
};

export default function ArticleContentBody({ html }) {
  if (!html) return null;

  return parse(html, {
    replace(domNode) {
      if (domNode.type === "tag" && domNode.name === "img") {
        return <ArticleImage imgNode={domNode} />;
      }
      if (domNode.type === "tag" && domNode.name === "a") {
        return domNode.children.length > 0 ? handleLinkWithImg(domNode) : domNode;
      }
      if (
        domNode.type === "tag" &&
        domNode.name === "p" &&
        hasBlockContent(domNode)
      ) {
        domNode.name = "div";
        return domNode;
      }
      if (domNode.type === "tag" && domNode.name === "iframe") {
        return <Iframe domNode={domNode} />;
      }
      if (domNode.type === "tag" && domNode.name === "pre") {
        const codeNode = domNode.children.find(
          (child) => child.type === "tag" && child.name === "code",
        );

        if (codeNode) {
          const className = codeNode.attribs?.class || "";
          const language =
            className
              .split(/\s+/)
              .find(
                (cls) => cls.startsWith("language-") || cls.startsWith("lang-"),
              )
              ?.replace(/^(language-|lang-)/, "") || "text";

          const code = getTextContent(codeNode)
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          return code ? (
            <CodeBlock code={code} language={language} />
          ) : (
            domNode
          );
        }

        const code = getTextContent(domNode)
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (!code) {
          return domNode;
        }

        return <CodeBlock code={code} language="text" />;
      }
      return undefined;
    },
  });
}
