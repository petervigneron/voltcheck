// The page VoltcheckBot's User-Agent URL points to: what the crawler is,
// how it behaves, and how a site operator can exclude it.
export const metadata = { title: "About VoltcheckBot" };

export default function BotPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-xl font-bold">VoltcheckBot</h1>
      <p>
        VoltcheckBot is the crawler behind Voltcheck, a site that helps shoppers find
        electric vehicles for sale. It visits public dealer inventory pages and reads the
        structured vehicle data (schema.org JSON-LD) those pages publish, and links every
        listing back to its source page on the dealer&apos;s own site.
      </p>
      <h2 className="text-base font-semibold">How it behaves</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Identifies itself in every request&apos;s User-Agent header (never impersonates a browser).</li>
        <li>Obeys robots.txt Disallow and Crawl-delay rules.</li>
        <li>Waits at least 1.1 seconds between requests to the same host.</li>
        <li>Backs off and does not retry when a site returns an error or challenge.</li>
      </ul>
      <h2 className="text-base font-semibold">Excluding your site</h2>
      <p>
        Add this to your robots.txt and VoltcheckBot will not fetch your pages:
      </p>
      <pre className="rounded-lg bg-zinc-100 dark:bg-zinc-900 p-3">{`User-agent: VoltcheckBot
Disallow: /`}</pre>
    </div>
  );
}
