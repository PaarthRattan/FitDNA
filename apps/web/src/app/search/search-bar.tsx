"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, INPUT } from "@/components/ui";

export function SearchBar({ query, fitsOnly }: { query: string; fitsOnly: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(query);

  function buildHref(q: string, fits: boolean): string {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (fits) params.set("fits", "1");
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(buildHref(value, fitsOnly));
  }

  return (
    <form onSubmit={onSubmit} role="search" className="px-5 py-4 flex gap-2 border-b border-ink items-center flex-wrap">
      <label htmlFor="q" className="sr-only">
        Search all markets
      </label>
      <input
        id="q"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe the garment, brand and size"
        className={`flex-1 min-w-[200px] ${INPUT}`}
      />
      <Button type="submit">Search</Button>
      <Link
        href={buildHref(value, !fitsOnly)}
        aria-pressed={fitsOnly}
        className={`inline-flex items-center border border-ink font-ui font-bold uppercase text-xs px-3 py-2 leading-none no-underline hover:bg-primary hover:text-canvas ${
          fitsOnly ? "bg-sticker text-ink" : "bg-canvas text-ink"
        }`}
      >
        Filters: fits me{fitsOnly ? " ✓" : ""}
      </Link>
    </form>
  );
}
