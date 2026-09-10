"use client";
import Link from "next/link";
import { destinations } from "@/lib/trips/sample";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";

export const inspiration = [
  ...destinations,
  ...[
    ["Goa", "India", "Beach days & Portuguese lanes"],
    ["Jaipur", "India", "Palaces, markets & local flavours"],
    ["Paris", "France", "Art, neighbourhoods & café stops"],
    ["Rome", "Italy", "Ancient streets & long lunches"],
    ["Bangkok", "Thailand", "Temples, canals & street food"],
    ["Cape Town", "South Africa", "Coastal walks & mountain views"],
    ["Queenstown", "New Zealand", "Lakes, trails & alpine air"],
    ["Istanbul", "Türkiye", "Ferries, bazaars & layered history"],
    ["Lisbon", "Portugal", "Hillside streets & Atlantic escapes"],
  ].map(([name, country, detail]) => ({ name, country, detail, tag: "Find your next chapter", image: "" })),
];

export function DestinationCarousel() {
  return (
    <Carousel opts={{ align: "start" }} className="inspiration-carousel" aria-label="Destination inspiration">
      <div className="inspiration-controls">
        <span>Swipe or use the arrows to explore {inspiration.length} places</span>
        <CarouselPrevious className="static translate-y-0" />
        <CarouselNext className="static translate-y-0" />
      </div>
      <CarouselContent>
        {inspiration.map((d) => (
          <CarouselItem key={d.name} className="basis-[85%] sm:basis-1/2 lg:basis-1/3">
            <Link href={`/?destination=${encodeURIComponent(d.name + ", " + d.country)}`} className="destination-card inspiration-card">
              {d.image && <img src={d.image} alt={`${d.name}, ${d.country}`} loading="lazy" decoding="async" width={480} height={300} />}
              <span className="dest-badge">{d.country}</span>
              <div className="dest-copy"><h3>{d.name}</h3><p>{d.detail}</p></div>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
