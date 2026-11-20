import { buildLlmsTxt } from "@/lib/seo/llmsTxt";

/**
 * `/llms.txt` — a plain-text map of the public site for language models.
 *
 * Served as a route handler rather than a file in `public/` so the URLs come
 * from `siteConfig` (one origin, no hardcoded domain) and so the content stays
 * in step with `INDEXABLE_ROUTES`.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
