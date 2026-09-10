"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { airbnbSearchUrl, filterStayCollections, stayCollections } from "@/lib/trips/stays";

export function DestinationStays({ destination }: { destination: string }) {
  const place = destination.trim();
  if (!place) return null;
  return (
    <div className="destination-stays">
      <a href={airbnbSearchUrl(place)} target="_blank" rel="noopener noreferrer">
        <span>View Airbnb stays near {place}</span><ArrowUpRight size={18} aria-hidden="true" />
      </a>
      <p>Opens listings on Airbnb in a new tab. Choose dates and guests there.</p>
    </div>
  );
}

export function StayFinder() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const matches = filterStayCollections(query, country);
  const visible = expanded || query.trim() || country !== "all" ? matches : matches.slice(0, 6);
  const count = matches.reduce((total, collection) => total + collection.destinations.length, 0);

  return (
    <section className="stay-picks" id="stay-picks" aria-labelledby="stay-picks-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FIND A STAY</span>
          <h2 id="stay-picks-title">Your next stay, anywhere.</h2>
        </div>
        <span className="subtext">Browse by country. Search any destination.</span>
      </div>
      <p className="stay-disclosure">
        Open Airbnb’s current listings for a place you love. Choose your dates and
        compare prices, reviews, and availability there. Links open in a new tab.
      </p>
      <div className="stay-controls">
        <form className="stay-search" action="https://www.airbnb.com/s/homes" method="get" target="_blank" rel="noopener noreferrer">
          <label className="field" htmlFor="stay-destination">
            Search any destination
            <input id="stay-destination" name="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Goa, Paris, or anywhere else" maxLength={200} type="search" required />
          </label>
          <button className="primary" disabled={!query.trim()} type="submit">
            <Search size={16} aria-hidden="true" /> Search Airbnb
          </button>
        </form>
        <div className="field stay-country">
          <span id="stay-country-label">Browse a country</span>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger aria-labelledby="stay-country-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {stayCollections.map((collection) => (
                <SelectItem key={collection.country} value={collection.country}>{collection.country}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="stay-results" role="status">
        {count > 0
          ? `${count} destination shortcuts across ${matches.length} ${matches.length === 1 ? "country" : "countries"}${visible.length < matches.length ? ` · Showing ${visible.length} countries` : ""}`
          : "No directory shortcuts match these filters. You can still search this destination on Airbnb."}
      </p>
      {query.trim() && (
        <p className="stay-search-hint">Search Airbnb opens results for “{query.trim()}”. The country filter only changes the directory below.</p>
      )}
      <div className="stay-columns">
        {visible.map((collection) => (
          <article className="stay-column" key={collection.country}>
            <div className="stay-column-header">
              <h3>{collection.country}</h3>
              <a href={airbnbSearchUrl(collection.country)} target="_blank" rel="noopener noreferrer" className="text-button" aria-label={`Browse all Airbnb stays in ${collection.country} (opens in a new tab)`}>
                All stays <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </div>
            <ul className="stay-list">
              {collection.destinations.map((destination) => (
                <li key={destination}>
                  <a href={airbnbSearchUrl(`${destination}, ${collection.country}`)} target="_blank" rel="noopener noreferrer" aria-label={`Find Airbnb stays in ${destination}, ${collection.country} (opens in a new tab)`}>
                    <span>{destination}</span><ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {!query.trim() && country === "all" && (
        <button className="secondary stay-expand" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer countries" : `Show all ${stayCollections.length} countries`}
        </button>
      )}
      <p className="stay-disclosure stay-footnote">
        These are destination shortcuts, not ranked property recommendations. Looking
        beyond this directory? Enter any city, region, or country above.
      </p>
    </section>
  );
}
