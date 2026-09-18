import cities from "@/data/locations/cities.json";
import nameIndex from "@/data/locations/name-index.json";
import countries from "@/data/locations/countries.json";

type City = [id: string, name: string, asciiName: string, region: string, countryCode: string, population: number];
export type DestinationMatch = { name: string; kind: "city" | "country" | "continent" };

const continents = ["Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America"];
const countryNames = Object.values(countries as Record<string, string>);
const aliases: Record<string, string> = { usa: "United States", us: "United States", uk: "United Kingdom", uae: "United Arab Emirates", czechia: "Czech Republic", russia: "Russian Federation", "south korea": "South Korea" };
const clean = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const indexedName = (row: string) => row.slice(0, row.indexOf("\t"));
const positions = (row: string) => row.slice(row.indexOf("\t") + 1).split(",").map(Number);
function lowerBound(query: string) {
  let low = 0, high = nameIndex.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (indexedName(nameIndex[middle]) < query) low = middle + 1;
    else high = middle;
  }
  return low;
}
function exactCities(query: string): City[] {
  const row = nameIndex[lowerBound(query)];
  const matches = row && indexedName(row) === query ? positions(row).map((index) => cities[index] as City) : [];
  // Prefer the official name within the most populous matching country's results.
  const canonical = matches.find((city) => city[4] === matches[0][4] && [city[1], city[2]].some((name) => clean(name) === query));
  return canonical ? [canonical, ...matches.filter((city) => city !== canonical)] : matches;
}
const cityLabel = (city: City) => {
  const country = (countries as Record<string, string>)[city[4]];
  return [city[1], city[3] && clean(city[3]) !== clean(city[1]) ? city[3] : "", country].filter(Boolean).join(", ");
};
function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

export function resolveDestination(value: string): DestinationMatch | null {
  const query = clean(value);
  if (!query) return null;
  const alias = aliases[query];
  const country = countryNames.find((name) => clean(name) === query) ?? alias;
  if (country) return { name: country, kind: "country" };
  const continent = continents.find((name) => clean(name) === query);
  if (continent) return { name: continent, kind: "continent" };
  const parts = value.split(",").map(clean).filter(Boolean);
  const city = exactCities(parts[0] ?? "").find((entry) => {
    if (parts.length < 2) return true;
    const labels = [entry[3], (countries as Record<string, string>)[entry[4]]].filter(Boolean).map(clean);
    return parts.slice(1).every((part) => labels.includes(part));
  });
  return city ? { name: cityLabel(city), kind: "city" } : null;
}

export function suggestDestinations(value: string, limit = 5): DestinationMatch[] {
  const query = clean(value);
  if (query.length < 2) return [];
  const starts = (name: string) => clean(name).startsWith(query);
  const exact = resolveDestination(value);
  const matches: DestinationMatch[] = exact ? [exact] : [];
  for (const country of countryNames) if (starts(country)) matches.push({ name: country, kind: "country" });
  for (const continent of continents) if (starts(continent)) matches.push({ name: continent, kind: "continent" });
  const found = new Set<number>();
  for (let i = lowerBound(query); i < nameIndex.length && indexedName(nameIndex[i]).startsWith(query); i++) {
    for (const position of positions(nameIndex[i])) found.add(position);
  }
  // Only suggest typos; never silently validate a fuzzy match as the destination.
  if (!matches.length && !found.size && query.length <= 40) {
    for (let i = lowerBound(query[0]); i < nameIndex.length && indexedName(nameIndex[i]).startsWith(query[0]); i++) {
      if (distance(indexedName(nameIndex[i]), query) <= 2) {
        for (const position of positions(nameIndex[i])) found.add(position);
      }
    }
  }
  // Catalogue positions are ordered by population, with exact matches first above.
  for (const position of [...found].sort((a, b) => a - b).slice(0, limit)) {
    matches.push({ name: cityLabel(cities[position] as City), kind: "city" });
  }
  return [...new Map(matches.map((match) => [clean(match.name), match])).values()].slice(0, limit);
}
