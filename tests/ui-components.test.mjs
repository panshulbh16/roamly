import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, ws: false },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("destination stays follow current or saved input and hide for empty destinations", async () => {
  const { DestinationStays } = await vite.ssrLoadModule("/components/trips/stay-finder.tsx");
  for (const destination of ["", "   "]) {
    assert.equal(renderToStaticMarkup(React.createElement(DestinationStays, { destination })), "");
  }
  for (const destination of ["Goa, India", "Kyoto, Japan", "Tórshavn, Faroe Islands", "京都 日本", '<script>alert("x")</script>']) {
    const html = renderToStaticMarkup(React.createElement(DestinationStays, { destination }));
    assert.ok(html.includes(`href="https://www.airbnb.com/s/homes?query=${encodeURIComponent(destination)}"`));
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /Choose dates and guests there/);
    assert.doesNotMatch(html, /<script>/);
  }
});

test("stay finder has a working native Airbnb search, labeled filter and bounded initial directory", async () => {
  const { StayFinder } = await vite.ssrLoadModule("/components/trips/stay-finder.tsx");
  const html = renderToStaticMarkup(React.createElement(StayFinder));
  assert.match(html, /action="https:\/\/www.airbnb.com\/s\/homes"/);
  assert.match(html, /method="get"/);
  assert.match(html, /name="query"/);
  assert.match(html, /for="stay-destination"/);
  assert.match(html, /aria-labelledby="stay-country-label"/);
  assert.match(html, /disabled="" type="submit"/);
  assert.match(html, /role="status"/);
  assert.match(html, /240 destination shortcuts across 24 countries/);
  assert.equal((html.match(/class="stay-column"/g) ?? []).length, 6);
  assert.equal((html.match(/aria-label="Find Airbnb stays in /g) ?? []).length, 60);
  assert.match(html, /Show all 24 countries/);
});

test("inspiration carousel includes distinct destinations, accessible controls and encoded planner links", async () => {
  const { DestinationCarousel, inspiration } = await vite.ssrLoadModule('/components/trips/destination-carousel.tsx');
  const html = renderToStaticMarkup(React.createElement(DestinationCarousel));
  assert.equal(inspiration.length, 12);
  assert.equal(new Set(inspiration.map(d => d.name)).size, 12);
  for (const d of inspiration) assert.ok(html.includes(`href="/?destination=${encodeURIComponent(d.name + ', ' + d.country)}"`));
  assert.match(html, /Destination inspiration/);
  assert.match(html, /Previous slide/);
  assert.match(html, /Next slide/);
  assert.equal((html.match(/loading="lazy"/g) ?? []).length, 3);
});

test("destination advice renders both sides, escapes text and preserves legacy trips", async () => {
  const { DestinationAdvice } = await vite.ssrLoadModule('/components/trips/destination-advice.tsx');
  const { destinationAdviceSchema, tripSchema } = await vite.ssrLoadModule('/lib/trips/schema.ts');
  const { sampleTrip } = await vite.ssrLoadModule('/lib/trips/sample.ts');
  const advice = { highlights: ['Temple gardens reward early starts.', 'Walkable historic streets.'], watchOutFor: ['Popular temples get crowded; arrive early.', '<script>bad</script>'] };
  assert.equal(destinationAdviceSchema.safeParse(advice).success, true);
  for (const invalid of [{...advice,highlights:[]},{...advice,watchOutFor:[' ']},{...advice,watchOutFor:['x'.repeat(301),'ok']}]) assert.equal(destinationAdviceSchema.safeParse(invalid).success,false);
  const html = renderToStaticMarkup(React.createElement(DestinationAdvice, {advice,destination:'Kyoto'}));
  assert.match(html, /What you’ll love/);
  assert.match(html, /Plan around these/);
  assert.match(html, /arrive early/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(renderToStaticMarkup(React.createElement(DestinationAdvice, {destination:'Kyoto'})), '');
  assert.equal(tripSchema.safeParse(sampleTrip).success,true);
  const saved = tripSchema.parse({...sampleTrip,itinerary:{...sampleTrip.itinerary,destinationAdvice:advice}});
  assert.deepEqual(tripSchema.parse(JSON.parse(JSON.stringify(saved))).itinerary.destinationAdvice,advice);
});
