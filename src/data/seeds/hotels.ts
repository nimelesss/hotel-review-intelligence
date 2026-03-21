import { Hotel } from "@/entities/types";

const now = new Date().toISOString();

export const seedHotels: Hotel[] = [
  {
    id: "hotel-courtyard-rostov",
    name: "Courtyard by Marriott Rostov-on-Don",
    brand: "Courtyard by Marriott",
    city: "Rostov-on-Don",
    country: "Russia",
    category: "4*",
    address: "Rostov-on-Don, Russia (exact address to be specified)",
    coordinates: {
      lat: 47.2221,
      lon: 39.7188
    },
    description:
      "Business-oriented city hotel with infrastructure for corporate trips and events.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "hotel-riverpark-kazan",
    name: "Riverpark Hotel Kazan",
    brand: "Riverpark",
    city: "Kazan",
    country: "Russia",
    category: "4*",
    address: "Kazan, Russia (seed data sample)",
    coordinates: {
      lat: 55.7961,
      lon: 49.1064
    },
    description:
      "Urban mixed-demand hotel: business, family trips, and event-driven stays.",
    createdAt: now,
    updatedAt: now
  }
];
