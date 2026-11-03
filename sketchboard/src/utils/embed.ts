import { parseInternalLink } from "./internalLinks";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Normalize user-typed links, rejecting script-capable schemes like javascript:. */
export function sanitizeLink(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // links into this drawing (see internalLinks.ts) are kept as-is when well-formed
  if (/^sketchboard:/i.test(s)) return parseInternalLink(s) ? s : null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return SAFE_LINK_PROTOCOLS.has(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

export function sanitizeEmbedUrl(raw: string): string | null {
  const link = sanitizeLink(raw);
  if (!link) return null;
  const u = new URL(link);
  return u.protocol === "http:" || u.protocol === "https:" ? link : null;
}

export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  return !/\s/.test(t) && (/^https?:\/\/\S+\.\S+/i.test(t) || /^www\.\S+\.\S+/i.test(t));
}

export interface EmbedInfo {
  src: string;
  aspect: number;
  provider: string;
}

/** Known providers whose share links need rewriting to their embeddable player URL. */
export function getKnownEmbed(url: string): EmbedInfo | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const path = u.pathname;

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const shorts = path.match(/^\/shorts\/([\w-]+)/);
    if (shorts) return { src: `https://www.youtube.com/embed/${shorts[1]}`, aspect: 9 / 16, provider: "YouTube" };
    if (path.startsWith("/embed/")) return { src: url, aspect: 16 / 9, provider: "YouTube" };
    const v = u.searchParams.get("v");
    if (v) {
      const t = u.searchParams.get("t");
      return { src: `https://www.youtube.com/embed/${v}${t ? `?start=${parseInt(t, 10) || 0}` : ""}`, aspect: 16 / 9, provider: "YouTube" };
    }
    const list = u.searchParams.get("list");
    if (list) return { src: `https://www.youtube.com/embed/videoseries?list=${list}`, aspect: 16 / 9, provider: "YouTube" };
  }
  if (host === "youtu.be") {
    const id = path.slice(1);
    if (id) return { src: `https://www.youtube.com/embed/${id}`, aspect: 16 / 9, provider: "YouTube" };
  }
  if (host === "vimeo.com") {
    const id = path.match(/^\/(\d+)/)?.[1];
    if (id) return { src: `https://player.vimeo.com/video/${id}`, aspect: 16 / 9, provider: "Vimeo" };
  }
  if (host === "player.vimeo.com") return { src: url, aspect: 16 / 9, provider: "Vimeo" };
  if (host === "loom.com") {
    const id = path.match(/^\/(?:share|embed)\/([\w-]+)/)?.[1];
    if (id) return { src: `https://www.loom.com/embed/${id}`, aspect: 16 / 9, provider: "Loom" };
  }
  if (host === "figma.com" && /^\/(file|design|proto|board)\//.test(path)) {
    return { src: `https://www.figma.com/embed?embed_host=sketchboard&url=${encodeURIComponent(url)}`, aspect: 16 / 10, provider: "Figma" };
  }
  if (host === "codepen.io") {
    const m = path.match(/^\/([\w-]+)\/(?:pen|embed)\/([\w-]+)/);
    if (m) return { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, aspect: 16 / 10, provider: "CodePen" };
  }
  if (host === "codesandbox.io") {
    const id = path.match(/^\/(?:s|embed|p\/sandbox)\/([\w-]+)/)?.[1];
    if (id) return { src: `https://codesandbox.io/embed/${id}`, aspect: 16 / 10, provider: "CodeSandbox" };
  }
  if (host === "open.spotify.com") {
    const m = path.match(/^\/(?:embed\/)?(track|album|playlist|episode|show|artist)\/(\w+)/);
    if (m) return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, aspect: m[1] === "track" ? 4 : 4 / 3, provider: "Spotify" };
  }
  if (host === "docs.google.com") {
    const m = path.match(/^\/(document|spreadsheets|presentation|forms)\/d\/([\w-]+)/);
    if (m) {
      const suffix = m[1] === "forms" ? "viewform?embedded=true" : m[1] === "presentation" ? "embed" : "preview";
      return { src: `https://docs.google.com/${m[1]}/d/${m[2]}/${suffix}`, aspect: 4 / 3, provider: "Google Docs" };
    }
  }
  if (host === "google.com" && path.startsWith("/maps/embed")) return { src: url, aspect: 4 / 3, provider: "Google Maps" };
  if (host === "excalidraw.com" || host === "link.excalidraw.com") return { src: url, aspect: 16 / 10, provider: "Excalidraw" };
  return null;
}

/** Embed source for any http(s) URL: known providers get their player URL, everything else loads as-is. */
export function getEmbedSrc(url: string): string {
  return getKnownEmbed(url)?.src ?? url;
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
