"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Revenue" },
  { href: "/retention/", label: "Retention" },
  { href: "/churn/", label: "Why members churn" },
  { href: "/model/", label: "Predicting churn" },
  { href: "/method/", label: "Method" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Pages" className="-mx-1 flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-[14px] transition-colors"
            style={{
              color: active ? "var(--ink)" : "var(--ink-2)",
              background: active ? "var(--grid)" : "transparent",
              fontWeight: active ? 600 : 400,
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
