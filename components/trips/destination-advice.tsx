import { ThumbsUp, Info } from "lucide-react";
import type { Itinerary } from "@/lib/trips/schema";

export function DestinationAdvice({ advice, destination }: {
  advice: Itinerary["destinationAdvice"];
  destination: string;
}) {
  if (!advice) return null;
  return (
    <section className="destination-advice" aria-label={`Know before you go to ${destination}`}>
      <h2>Know before you go</h2>
      <p className="subtext">A balanced look at {destination}, for your trip.</p>
      <div className="advice-columns">
        <div>
          <h3><ThumbsUp size={16} aria-hidden="true" /> What you’ll love</h3>
          <ul>{advice.highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
        <div>
          <h3><Info size={16} aria-hidden="true" /> Plan around these</h3>
          <ul>{advice.watchOutFor.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      </div>
      <p className="form-note">AI travel guidance. Check current weather, opening hours and official travel advice before departure.</p>
    </section>
  );
}
