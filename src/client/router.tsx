import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useState } from "react";

// Mini-routeur basé sur l'API History : suffisant pour une dizaine de pages.

const ecouteurs = new Set<() => void>();

export function naviguer(chemin: string, remplacer = false): void {
  if (remplacer) history.replaceState(null, "", chemin);
  else history.pushState(null, "", chemin);
  window.scrollTo(0, 0);
  ecouteurs.forEach((f) => f());
}

export function useChemin(): string {
  const [chemin, setChemin] = useState(location.pathname);
  useEffect(() => {
    const maj = () => setChemin(location.pathname);
    ecouteurs.add(maj);
    window.addEventListener("popstate", maj);
    return () => {
      ecouteurs.delete(maj);
      window.removeEventListener("popstate", maj);
    };
  }, []);
  return chemin;
}

export function Lien({ href, onClick, ...reste }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const actif = location.pathname === href;
  return (
    <a
      href={href}
      aria-current={actif ? "page" : undefined}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        naviguer(href);
      }}
      {...reste}
    />
  );
}
