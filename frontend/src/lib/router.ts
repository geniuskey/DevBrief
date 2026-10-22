import { useEffect, useState } from "react";

// Hash routing keeps the SPA deployable behind any static server or proxy
// without rewrite rules.
export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function current(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, search = ""] = raw.split("?");
  return {
    path,
    segments: path.split("/").filter(Boolean),
    query: new URLSearchParams(search),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string, replace = false) {
  const target = `#${path}`;
  if (replace) {
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
}

export const href = (path: string) => `#${path}`;
