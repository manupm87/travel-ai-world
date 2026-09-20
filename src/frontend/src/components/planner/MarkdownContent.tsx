"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * The tags a chat bubble may render. Headings are on the list only so the
 * components map below can turn them into bold paragraphs: a bubble has no
 * room for an `h1`. Everything else — images, tables, raw HTML (which
 * react-markdown never parses anyway, and we keep it that way: no
 * `rehype-raw`) — is unwrapped, so its text still reaches the reader while
 * the markup does not.
 */
const ALLOWED_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "a",
  "code",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

/** Block rhythm: spacing between blocks, none at the edges of the bubble. */
const BLOCK = "my-2 first:mt-0 last:mb-0";
const LIST = cn(BLOCK, "space-y-1 pl-5");

function Block({ children }: { children?: ReactNode }) {
  return <p className={BLOCK}>{children}</p>;
}

/** A heading is a bold paragraph, at the body's own size. */
function Heading({ children }: { children?: ReactNode }) {
  return <p className={cn(BLOCK, "font-semibold")}>{children}</p>;
}

const components: Components = {
  p: Block,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className={cn(LIST, "list-disc")}>{children}</ul>,
  ol: ({ children }) => <ol className={cn(LIST, "list-decimal")}>{children}</ol>,
  // A list item's own paragraphs must not add a second rhythm inside the row.
  li: ({ children }) => <li className="[&>p]:my-0">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:text-accent-hover"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-bg-primary/50 px-1 py-0.5 text-[0.9em]">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className={cn(BLOCK, "border-l-2 border-border pl-3 text-text-secondary")}>
      {children}
    </blockquote>
  ),
};

interface MarkdownContentProps {
  /** Assistant text, Markdown as the model wrote it — possibly half a token. */
  content: string;
  className?: string;
}

/**
 * The assistant's answer, rendered from Markdown: the model writes `**bold**`
 * and `- item` lines and the traveller must see bold text and bullets, not the
 * characters. Safe by construction — no raw HTML, a short tag allow-list, and
 * every link opens in a new tab with `rel="noopener noreferrer"`.
 *
 * Streaming needs nothing special: it re-parses on every flushed delta, and
 * half-written Markdown simply renders as the text it is so far.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
      >
        {content}
      </Markdown>
    </div>
  );
}
