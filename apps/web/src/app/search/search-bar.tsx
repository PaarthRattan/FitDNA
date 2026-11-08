"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, INPUT } from "@/components/ui";

/**
 * Filters the listings already on the page. Searching the marketplaces themselves
 * comes with the eBay integration (M5); other sites are added by pasting a link.
 */
export function SearchBar({ query, fitsOnly, canImport }: { query: string; fitsOnly: boolean; canImport: boolean }) {
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
        Filter your listings
      </label>
      <input
        id="q"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Filter by title, site or size"
        className={`flex-1 min-w-[200px] ${INPUT}`}
      />
      <Button type="submit">Filter</Button>
      <Link
        href={buildHref(value, !fitsOnly)}
        aria-pressed={fitsOnly}
        className={`inline-flex items-center border border-ink font-ui font-bold uppercase text-xs px-3 py-2 leading-none no-underline hover:bg-primary hover:text-canvas ${
          fitsOnly ? "bg-sticker text-ink" : "bg-canvas text-ink"
        }`}
      >
        Fits me{fitsOnly ? " ✓" : ""}
      </Link>
      {canImport && (
        <Button href="/listings/new" variant="secondary">
          + Paste a link
        </Button>
      )}
    </form>
  );
}
