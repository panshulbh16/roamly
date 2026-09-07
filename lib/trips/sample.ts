import type { Trip } from "./schema";
export const sampleTrip: Trip = {
  id: "c402d47a-3a0a-4c6b-ae59-ff134a7f960b",
  source: "sample",
  createdAt: "2026-09-07T00:00:00Z",
  intake: {
    destination: "Kyoto, Japan",
    startDate: "",
    days: 3,
    travelers: 2,
    budget: "Comfort",
    pace: "Balanced",
    interests: ["Culture", "Food"],
    needs: "",
    homeCity: "",
  },
  itinerary: {
    title: "A little slower, a little Kyoto",
    summary:
      "Three days of quiet lanes, temple gardens, and a taste of Kyoto. This is an illustrative itinerary, not a live-verified travel recommendation.",
    days: [
      {
        title: "Old streets & a first taste of Kyoto",
        activities: [
          {
            time: "Morning",
            title: "Ease into Higashiyama",
            description:
              "Explore the old lanes around Ninenzaka and Sannenzaka at your own pace. The streets can be steep and crowded.",
            place: "Higashiyama, Kyoto",
          },
          {
            time: "Afternoon",
            title: "A pause in a temple garden",
            description:
              "Make time for the grounds around Kiyomizu-dera. Check current access and ticket information before visiting.",
            place: "Kiyomizu-dera, Kyoto",
          },
          {
            time: "Evening",
            title: "Find your way through Gion",
            description:
              "Walk public streets, respect photography restrictions, and choose a restaurant that can accommodate your dietary requirements.",
            place: "Gion, Kyoto",
          },
        ],
      },
      {
        title: "Bamboo paths & riverside moments",
        activities: [
          {
            time: "Morning",
            title: "An early start in Arashiyama",
            description:
              "Explore the bamboo grove before the busiest part of the day. Allow for transit from central Kyoto.",
            place: "Arashiyama Bamboo Grove, Kyoto",
          },
          {
            time: "Afternoon",
            title: "Slow down by the river",
            description:
              "Walk around the Togetsukyo Bridge area and stop for lunch. Confirm accessibility of your chosen route.",
            place: "Togetsukyo Bridge, Kyoto",
          },
          {
            time: "Evening",
            title: "A relaxed dinner near your stay",
            description: "Keep the evening flexible after a day outdoors.",
            place: "Kyoto Station, Kyoto",
          },
        ],
      },
      {
        title: "Torii gates & local discoveries",
        activities: [
          {
            time: "Morning",
            title: "Visit Fushimi Inari",
            description:
              "Explore the lower shrine grounds, or extend your walk if conditions and energy allow. Upper trails involve many steps.",
            place: "Fushimi Inari Taisha, Kyoto",
          },
          {
            time: "Afternoon",
            title: "Browse Nishiki Market",
            description:
              "Look for local specialties and ask vendors about ingredients, including fish-based stocks.",
            place: "Nishiki Market, Kyoto",
          },
          {
            time: "Evening",
            title: "One last Kyoto moment",
            description:
              "Leave a buffer for packing and onward travel. Check your train departure and luggage arrangements.",
            place: "Kyoto Station, Kyoto",
          },
        ],
      },
    ],
    tips: [
      "Opening hours, fares, and availability are not live verified. Check official sources before booking.",
      "This example excludes flights, accommodation reservations, and price quotes.",
      "Outdoor activities depend on weather and individual mobility.",
    ],
  },
};
export const destinations = [
  {
    name: "The Dolomites",
    country: "Italy",
    tag: "For the mountain soul",
    detail: "Alpine landscapes · Slow adventures",
    image: "/images/dolomites.jpg",
    interests: ["Nature", "Adventure"],
  },
  {
    name: "Kyoto",
    country: "Japan",
    tag: "A little culture, a little calm",
    detail: "Timeless streets · Local discoveries",
    image: "/images/kyoto.jpg",
    interests: ["Culture", "Food"],
  },
  {
    name: "Bali",
    country: "Indonesia",
    tag: "Find your island rhythm",
    detail: "Rice terraces · Tropical escapes",
    image: "/images/bali.jpg",
    interests: ["Nature", "Relaxation"],
  },
];
