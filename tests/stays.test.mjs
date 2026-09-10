import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({ entryPoints: ["lib/trips/stays.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { airbnbSearchUrl, filterStayCollections, stayCollections } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"),
);

test("all country shortcuts point to ten distinct, country-qualified destination searches", () => {
  assert.equal(stayCollections.length, 24);
  assert.equal(new Set(stayCollections.map((c) => c.country)).size, 24);
  const urls = new Set();
  for (const collection of stayCollections) {
    assert.equal(collection.destinations.length, 10);
    assert.equal(new Set(collection.destinations).size, 10);
    for (const destination of collection.destinations) {
      const query = `${destination}, ${collection.country}`;
      const url = new URL(airbnbSearchUrl(query));
      assert.equal(url.origin, "https://www.airbnb.com");
      assert.equal(url.pathname, "/s/homes");
      assert.equal(url.searchParams.get("query"), query);
      urls.add(url.href);
    }
  }
  assert.equal(urls.size, 240);
});

test("arbitrary destinations preserve Unicode and punctuation without injecting URL parameters", () => {
  for (const place of ["  Kyoto, Japan  ", "京都 日本", "São Paulo", "Zu\u0308rich", "St. John’s", "Aix-en-Provence", "Baden-Württemberg", "Washington, D.C.", "A/B & C?x=1#near%20", "<script>alert(1)</script>", "https://example.com/?next=evil"]) {
    const url = new URL(airbnbSearchUrl(place));
    assert.equal(url.origin, "https://www.airbnb.com");
    assert.equal(url.pathname, "/s/homes");
    assert.equal(url.hash, "");
    assert.deepEqual([...url.searchParams.keys()], ["query"]);
    assert.equal(url.searchParams.get("query"), place.trim());
  }
});

test("directory searches ignore case, accents and surrounding spaces", () => {
  for (const query of ["ZURICH", " zürich ", "Zu\u0308rich", "zurich switzerland"]) {
    assert.deepEqual(filterStayCollections(query), [{ country: "Switzerland", destinations: ["Zürich"] }]);
  }
  assert.deepEqual(filterStayCollections("Paris, France"), [{ country: "France", destinations: ["Paris"] }]);
  assert.equal(filterStayCollections("japan")[0].destinations.length, 10);
});

test("country and text filters combine, reset and never mutate the directory", () => {
  const before = JSON.stringify(stayCollections);
  assert.equal(filterStayCollections("", "Japan").length, 1);
  assert.equal(filterStayCollections("   ").length, 24);
  assert.deepEqual(filterStayCollections("Paris", "Japan"), []);
  assert.equal(filterStayCollections("Paris", "all")[0].country, "France");
  assert.equal(filterStayCollections("", "not-in-directory").length, 0);
  assert.equal(JSON.stringify(stayCollections), before);
});

test("unlisted destinations still have an Airbnb search even when the directory has no match", () => {
  for (const destination of ["Tórshavn, Faroe Islands", "Singapore", "京都 日本"]) {
    assert.deepEqual(filterStayCollections(destination), []);
    assert.equal(new URL(airbnbSearchUrl(destination)).searchParams.get("query"), destination);
  }
});
