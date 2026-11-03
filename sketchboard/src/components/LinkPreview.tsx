import { useEffect, useState } from "react";
import { linkPreview } from "../linkNav";

/** A small picture of where an internal link goes; nothing for web links. */
export default function LinkPreview({ link }: { link: string }) {
  const [src, setSrc] = useState<{ link: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    linkPreview(link).then((url) => live && setSrc({ link, url }));
    return () => {
      live = false;
    };
  }, [link]);
  if (!src?.url || src.link !== link) return null;
  return <img className="link-preview" src={src.url} alt="" />;
}
