// Links into the drawing: the link format, labels, and how copies keep links working.
//   npm run test:app
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Page, SketchElement } from "../src/types";
import {
  backlinksTo,
  drawingLink,
  elementLink,
  localizeLink,
  linkSuggestions,
  pageLink,
  parseInternalLink,
  relink,
  resolveInternalLink,
} from "../src/utils/internalLinks";
import { cloneElements } from "../src/utils/clone";
import { sanitizeLink } from "../src/utils/embed";

function el(id: string, patch: Partial<SketchElement> = {}): SketchElement {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    angle: 0,
    strokeColor: "#000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    roundness: false,
    opacity: 100,
    seed: 1,
    groupId: null,
    ...patch,
  };
}

const pages: Page[] = [
  {
    id: "map",
    name: "Map",
    elements: [el("row", { text: "DeepSeek → page 2", link: elementLink("p2", "frame") })],
  },
  {
    id: "p2",
    name: "DeepSeek",
    elements: [
      el("frame", { type: "frame", name: "DeepSeek · 36 papers" }),
      el("title", { text: "DeepSeekMath", fontSize: 17, groupId: "card", y: 10 }),
      el("badge", { text: "★ Start here", fontSize: 13, groupId: "card", y: 0 }),
      el("detail", { text: "Feb 5, 2024 · arXiv 2402.03300", fontSize: 13, groupId: "card", y: 40 }),
    ],
  },
];

describe("link format", () => {
  test("round-trips page and element links", () => {
    assert.deepEqual(parseInternalLink(pageLink("p2")), { kind: "page", pageId: "p2" });
    assert.deepEqual(parseInternalLink(elementLink("p2", "title")), { kind: "el", pageId: "p2", elementId: "title" });
    assert.deepEqual(parseInternalLink("sketchboard:p/proj-1234/p2/title"), { kind: "drawing", projectId: "proj-1234", pageId: "p2", elementId: "title" });
    assert.deepEqual(parseInternalLink("sketchboard:p/proj-1234"), { kind: "drawing", projectId: "proj-1234" });
  });

  test("rejects malformed links, and sanitizeLink keeps only well-formed ones", () => {
    for (const bad of ["sketchboard:", "sketchboard:el/onlypage", "sketchboard:page/a b", "sketchboard:javascript:alert(1)"]) {
      assert.equal(parseInternalLink(bad), null, bad);
      assert.equal(sanitizeLink(bad), null, bad);
    }
    assert.equal(sanitizeLink(elementLink("p2", "title")), "sketchboard:el/p2/title");
    assert.equal(sanitizeLink("arxiv.org/abs/1"), "https://arxiv.org/abs/1");
    assert.equal(sanitizeLink("javascript:alert(1)"), null);
  });
});

describe("links to other drawings", () => {
  test("a copied link is stored short inside its own drawing and kept whole elsewhere", () => {
    const copied = drawingLink("proj-a", "p2", "title");
    assert.equal(copied, "sketchboard:p/proj-a/p2/title");
    assert.equal(localizeLink(copied, "proj-a"), elementLink("p2", "title"));
    assert.equal(localizeLink(drawingLink("proj-a", "p2"), "proj-a"), pageLink("p2"));
    assert.equal(localizeLink(copied, "proj-b"), copied);
    assert.equal(drawingLink("proj-a"), "sketchboard:p/proj-a");
  });

  test("they don't resolve locally and survive copying untouched", () => {
    const link = drawingLink("proj-a", "p2", "title");
    assert.equal(resolveInternalLink(link, pages), null);
    assert.equal(relink(link, new Map([["title", "t2"]]), { dropOutside: true }), link);
  });
});

describe("resolving", () => {
  test("names a grouped card by its largest text", () => {
    assert.equal(resolveInternalLink(elementLink("p2", "detail"), pages)?.label, "DeepSeek › DeepSeekMath");
    assert.equal(resolveInternalLink(pageLink("map"), pages)?.label, "Map");
  });

  test("follows an element that moved to another page, and reports missing targets", () => {
    assert.equal(resolveInternalLink(elementLink("map", "title"), pages)?.page.id, "p2");
    assert.equal(resolveInternalLink(elementLink("p2", "gone"), pages), null);
    assert.equal(resolveInternalLink(pageLink("gone"), pages), null);
  });

  test("suggestions list each card once, by its title", () => {
    const labels = linkSuggestions(pages, "2024").map((s) => s.label);
    assert.deepEqual(labels, ["DeepSeekMath"]);
    const outline = linkSuggestions(pages, "").map((s) => s.kind);
    assert.deepEqual(outline, ["page", "page", "frame"]);
  });

  test("backlinks find element links and text-range links", () => {
    const withText: Page[] = [
      ...pages,
      { id: "p3", name: "RL", elements: [el("intro", { text: "read after DeepSeekMath", textLinks: [{ start: 11, end: 23, url: elementLink("p2", "title") }] })] },
    ];
    assert.deepEqual(backlinksTo(withText, new Set(["frame"])).map((b) => b.element.id), ["row"]);
    const toCard = backlinksTo(withText, new Set(["title"]));
    assert.equal(toCard.length, 1);
    assert.equal(toCard[0].text, "DeepSeekMath");
    assert.deepEqual(backlinksTo(withText, new Set(), "p2").length, 0);
  });
});

describe("copying keeps links working", () => {
  test("relink points links between copied elements at the copies", () => {
    const ids = new Map([["a", "a2"]]);
    assert.equal(relink(elementLink("p1", "a"), ids, { pageId: "p9" }), "sketchboard:el/p9/a2");
    assert.equal(relink(elementLink("p1", "b"), ids), "sketchboard:el/p1/b");
    assert.equal(relink(elementLink("p1", "b"), ids, { dropOutside: true }), null);
    assert.equal(relink(pageLink("p1"), ids, { pageMap: new Map([["p1", "p1copy"]]) }), "sketchboard:page/p1copy");
    assert.equal(relink("https://example.com", ids, { dropOutside: true }), "https://example.com");
  });

  test("cloneElements remaps element and text links inside the copied set", () => {
    const src = [
      el("a", { link: elementLink("p1", "b") }),
      el("b", { text: "see a and elsewhere", textLinks: [{ start: 4, end: 5, url: elementLink("p1", "a") }, { start: 10, end: 19, url: elementLink("p1", "far") }] }),
    ];
    const [a, b] = cloneElements(src, 0, 0, { pageId: "p1" });
    assert.notEqual(a.id, "a");
    assert.equal(a.link, elementLink("p1", b.id));
    assert.equal(b.textLinks?.[0].url, elementLink("p1", a.id));
    assert.equal(b.textLinks?.[1].url, elementLink("p1", "far"), "links outside the copy keep their target");
  });

  test("duplicating a page points its own links into the copy", () => {
    const src = [el("a", { link: pageLink("p1") }), el("b", { link: elementLink("p1", "a") })];
    const [a, b] = cloneElements(src, 0, 0, { pageMap: new Map([["p1", "p1copy"]]) });
    assert.equal(a.link, pageLink("p1copy"));
    assert.equal(b.link, elementLink("p1copy", a.id));
  });

  test("library items drop links to things outside them", () => {
    const src = [el("a", { link: elementLink("p1", "elsewhere"), textLinks: [{ start: 0, end: 1, url: pageLink("p1") }], text: "x" })];
    const [a] = cloneElements(src, 0, 0, { dropOutside: true });
    assert.equal(a.link, null);
    assert.equal(a.textLinks, undefined);
  });
});
