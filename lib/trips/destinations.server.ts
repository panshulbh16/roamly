import cities from "@/data/locations/cities.json";
import countries from "@/data/locations/countries.json";

type City = [id: string, name: string, asciiName: string, region: string, countryCode: string, population: number];
export type DestinationMatch = { name: string; kind: "city" | "country" | "continent" };

const continents = ["Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America"];
const countryNames = Object.values(countries as Record<string, string>);
const aliases: Record<string, string> = { usa: "United States", us: "United States", uk: "United Kingdom", uae: "United Arab Emirates", czechia: "Czech Republic", russia: "Russian Federation", "south korea": "South Korea" };
const cityAliases: Record<string, string> = { bangalore: "1277333", munchen: "2867714" };
const clean = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const names = (city: City) => [city[1], city[2]].filter(Boolean).map(clean);
const citiesByName = new Map<string, City[]>();
for (const city of cities as City[]) for (const name of names(city)) citiesByName.set(name, [...(citiesByName.get(name) ?? []), city]);
for (const [alias, id] of Object.entries(cityAliases)) {
  const city = (cities as City[]).find((entry) => entry[0] === id);
  if (city) citiesByName.set(alias, [city]);
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
  const city = (citiesByName.get(parts[0] ?? "") ?? []).find((entry) => {
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
  for (const alias of Object.keys(cityAliases)) {
    if (alias.startsWith(query)) {
      const city = citiesByName.get(alias)?.[0];
      if (city) matches.push({ name: cityLabel(city), kind: "city" });
    }
  }
  for (const country of countryNames) if (starts(country)) matches.push({ name: country, kind: "country" });
  for (const continent of continents) if (starts(continent)) matches.push({ name: continent, kind: "continent" });
  for (const city of cities as City[]) {
    if (names(city).some((name) => name.startsWith(query))) matches.push({ name: cityLabel(city), kind: "city" });
    if (matches.length >= limit * 4) break;
  }
  if (!matches.length && query.length <= 40) for (const city of cities as City[]) {
    if (names(city).some((name) => name[0] === query[0] && distance(name, query) <= 2)) matches.push({ name: cityLabel(city), kind: "city" });
    if (matches.length >= limit) break;
  }
  return [...new Map(matches.map((match) => [clean(match.name), match])).values()].slice(0, limit);
}
