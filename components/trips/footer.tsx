"use client";
import { useState } from "react";
import { openCookieSettings } from "@/components/Analytics";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function TripFooter() {
  const [legal, setLegal] = useState<string | null>(null);
  return <>
      <footer className="footer">
        <span>© {new Date().getFullYear()} Roamly. Go your own way.</span>
        <div style={{ display: "flex", gap: 17 }}>
          <button onClick={() => setLegal("Privacy")}>Privacy</button>
          <button onClick={openCookieSettings}>Cookie settings</button>
          <button onClick={() => setLegal("Travel guidance")}>
            Travel guidance
          </button>
          <button onClick={() => setLegal("Photography")}>Photography</button>
        </div>
      </footer>
      <Dialog open={!!legal} onOpenChange={() => setLegal(null)}>
        <DialogContent>
          <DialogTitle>{legal}</DialogTitle>
          <DialogDescription>
            {legal === "Privacy" ? (
              "Roamly stores submitted searches and saved itineraries against your signed-in account. Delete searches in History and saved trips in My trips. Google/email sign-in is handled by Supabase when connected. Your trip preferences are sent to the AI provider only when you request generation. Joining the Plus list stores your account email. Delete individual saved trips in My trips. Avoid entering sensitive medical or personal details. Travel Together stores your drafts, published itineraries, join requests and reports. Published itineraries and your chosen host name are public. Introductions are visible to the host; private meeting details are visible to approved travellers. Withdrawing or cancellation retains the activity record. Roamly uses Google Analytics to understand how the site is used. Analytics cookies are set only if you accept them; until then Google receives cookieless, anonymous signals. Advertising features are off and no data is sold. Change your choice any time with Cookie settings. Public-launch privacy and support details are still being finalized."
            ) : legal === "Photography" ? (
              <>
                Photography by{" "}
                <a
                  href="https://unsplash.com/photos/5CsJnGSR4s4"
                  target="_blank"
                  rel="noreferrer"
                >
                  Raul Taciu
                </a>
                ,{" "}
                <a
                  href="https://unsplash.com/photos/yVusp1IqwpY"
                  target="_blank"
                  rel="noreferrer"
                >
                  Bruce Tang
                </a>
                , and{" "}
                <a
                  href="https://unsplash.com/photos/jN9JnZ-SyVc"
                  target="_blank"
                  rel="noreferrer"
                >
                  Radoslav Bali
                </a>{" "}
                on Unsplash.
              </>
            ) : (
              "Itineraries are suggestions, not reservations or guarantees. Prices, opening hours, weather, entry requirements, accessibility, and trail conditions need independent verification. Roamly does not currently sell bookings or charge for itineraries."
            )}
          </DialogDescription>
        </DialogContent>
      </Dialog>
  </>;
}
