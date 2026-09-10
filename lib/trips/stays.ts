export type StayCollection = {
  country: string;
  destinations: string[];
};

// A browse directory, not a property inventory. Airbnb resolves each search
// and supplies current listings, dates, prices, and booking conditions.
export const stayCollections: StayCollection[] = [
  { country: "India", destinations: ["Goa", "Jaipur", "Udaipur", "Manali", "Rishikesh", "Mumbai", "New Delhi", "Munnar", "Puducherry", "Varanasi"] },
  { country: "Japan", destinations: ["Tokyo", "Kyoto", "Osaka", "Nara", "Hakone", "Sapporo", "Niseko", "Fukuoka", "Hiroshima", "Okinawa"] },
  { country: "Indonesia", destinations: ["Bali", "Ubud, Bali", "Canggu, Bali", "Uluwatu, Bali", "Seminyak, Bali", "Nusa Penida", "Lombok", "Gili Trawangan", "Yogyakarta", "Jakarta"] },
  { country: "Italy", destinations: ["Rome", "Florence", "Venice", "Milan", "The Dolomites", "Lake Como", "Amalfi Coast", "Cinque Terre", "Sicily", "Sardinia"] },
  { country: "France", destinations: ["Paris", "Nice", "Lyon", "Bordeaux", "Marseille", "Strasbourg", "Chamonix", "Annecy", "Avignon", "Biarritz"] },
  { country: "Thailand", destinations: ["Bangkok", "Chiang Mai", "Phuket", "Krabi", "Koh Samui", "Koh Phangan", "Koh Tao", "Pattaya", "Hua Hin", "Pai"] },
  { country: "Spain", destinations: ["Barcelona", "Madrid", "Seville", "Granada", "Valencia", "Málaga", "Mallorca", "Ibiza", "Tenerife", "San Sebastián"] },
  { country: "Portugal", destinations: ["Lisbon", "Porto", "Sintra", "Lagos", "Faro", "Albufeira", "Madeira", "Ponta Delgada", "Coimbra", "Évora"] },
  { country: "Greece", destinations: ["Athens", "Santorini", "Mykonos", "Crete", "Corfu", "Rhodes", "Naxos", "Paros", "Zakynthos", "Thessaloniki"] },
  { country: "United Kingdom", destinations: ["London", "Edinburgh", "Bath", "York", "Oxford", "Cambridge", "Cotswolds", "Lake District", "Cornwall", "Isle of Skye"] },
  { country: "Switzerland", destinations: ["Zürich", "Lucerne", "Interlaken", "Grindelwald", "Lauterbrunnen", "Zermatt", "Geneva", "Bern", "Montreux", "St. Moritz"] },
  { country: "Turkey", destinations: ["Istanbul", "Göreme", "Antalya", "Bodrum", "Fethiye", "Kaş", "Marmaris", "Izmir", "Alaçatı", "Kuşadası"] },
  { country: "Vietnam", destinations: ["Hanoi", "Ho Chi Minh City", "Hoi An", "Da Nang", "Ha Long", "Sa Pa", "Ninh Binh", "Hue", "Da Lat", "Phu Quoc"] },
  { country: "United Arab Emirates", destinations: ["Dubai", "Abu Dhabi", "Sharjah", "Ras Al Khaimah", "Fujairah", "Ajman", "Al Ain", "Umm Al Quwain", "Khor Fakkan", "Hatta"] },
  { country: "United States", destinations: ["New York City", "Los Angeles", "San Francisco", "Miami", "Orlando", "Las Vegas", "Chicago", "New Orleans", "Honolulu", "Maui"] },
  { country: "Canada", destinations: ["Vancouver", "Toronto", "Montréal", "Québec City", "Banff", "Canmore", "Whistler", "Victoria", "Niagara Falls", "Halifax"] },
  { country: "Mexico", destinations: ["Mexico City", "Cancún", "Tulum", "Playa del Carmen", "Puerto Vallarta", "Oaxaca", "San Miguel de Allende", "Mérida", "Cabo San Lucas", "Bacalar"] },
  { country: "Brazil", destinations: ["Rio de Janeiro", "São Paulo", "Florianópolis", "Salvador", "Búzios", "Paraty", "Foz do Iguaçu", "Recife", "Jericoacoara", "Gramado"] },
  { country: "Peru", destinations: ["Lima", "Cusco", "Ollantaytambo", "Urubamba", "Arequipa", "Puno", "Paracas", "Ica", "Máncora", "Huaraz"] },
  { country: "Australia", destinations: ["Sydney", "Melbourne", "Brisbane", "Gold Coast", "Cairns", "Byron Bay", "Perth", "Adelaide", "Hobart", "Noosa Heads"] },
  { country: "New Zealand", destinations: ["Auckland", "Queenstown", "Wānaka", "Rotorua", "Wellington", "Christchurch", "Lake Tekapo", "Taupō", "Nelson", "Te Anau"] },
  { country: "South Africa", destinations: ["Cape Town", "Johannesburg", "Durban", "Stellenbosch", "Franschhoek", "Hermanus", "Knysna", "Plettenberg Bay", "Hazyview", "Hoedspruit"] },
  { country: "Morocco", destinations: ["Marrakech", "Fes", "Chefchaouen", "Essaouira", "Casablanca", "Rabat", "Tangier", "Agadir", "Taghazout", "Merzouga"] },
  { country: "Egypt", destinations: ["Cairo", "Giza", "Luxor", "Aswan", "Alexandria", "Hurghada", "El Gouna", "Sharm El Sheikh", "Dahab", "Siwa Oasis"] },
];

export function airbnbSearchUrl(destination: string): string {
  return `https://www.airbnb.com/s/homes?query=${encodeURIComponent(destination.trim())}`;
}

function searchText(value: string): string {
  return value.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function filterStayCollections(query: string, country = "all"): StayCollection[] {
  const terms = searchText(query).split(/[\s,]+/).filter(Boolean);
  return stayCollections
    .filter((collection) => country === "all" || collection.country === country)
    .map((collection) => ({
      ...collection,
      destinations: collection.destinations.filter((destination) => {
        const text = searchText(`${destination} ${collection.country}`);
        return terms.every((term) => text.includes(term));
      }),
    }))
    .filter((collection) => collection.destinations.length > 0);
}
