// Fixture in the exact shape of core_api's `TripResponse`. `satisfies` makes the
// compiler reject any drift from the generated contract (enum values included).
import type { components } from "@/types/generated/core-api";

const trip = {
  "id": "trip_japan_2026",
  "user_id": 1,
  "status": "planning",
  "created_at": "2026-03-01T10:30:00Z",
  "updated_at": "2026-03-12T14:45:00Z",
  "title": "Japan Explorer: Traditions & Neon",
  "description": "A 14-day journey experiencing the blend of ancient tradition and modern innovation in Japan.",
  "image_url": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80",
  "start_date": "2026-10-01",
  "end_date": "2026-10-14",
  "duration_days": 14,
  "travelers_adults": 2,
  "travelers_children": 0,
  "travelers_infants": 0,
  "travel_style": [
    "culture",
    "foodie"
  ],
  "pace_preference": "moderate",
  "accommodation_type": "mid-range",
  "budget_total": "6500.00",
  "budget_currency": "USD",
  "budget_accommodation": "2500.00",
  "budget_food": "2000.00",
  "budget_activities": "1000.00",
  "budget_transportation": "800.00",
  "budget_other": "200.00",
  "ai_weather_forecast": "Pleasant autumn weather! Tokyo 15-22°C, Kyoto 14-20°C. Perfect for walking and seeing the foliage.",
  "ai_local_tips": [
    "Get a Suica or Pasmo card for easy travel. Remember to keep left on escalators in Tokyo, but right in Osaka!"
  ],
  "destinations": [
    {
      "id": "dest_tokyo",
      "trip_id": "trip_japan_2026",
      "city": "Tokyo",
      "country": "Japan",
      "country_code": "JP",
      "lat": 35.6762,
      "lng": 139.6503,
      "arrival_date": "2026-10-01",
      "departure_date": "2026-10-06",
      "nights_staying": 5
    },
    {
      "id": "dest_kyoto",
      "trip_id": "trip_japan_2026",
      "city": "Kyoto",
      "country": "Japan",
      "country_code": "JP",
      "lat": 35.0116,
      "lng": 135.7681,
      "arrival_date": "2026-10-06",
      "departure_date": "2026-10-10",
      "nights_staying": 4
    },
    {
      "id": "dest_osaka",
      "trip_id": "trip_japan_2026",
      "city": "Osaka",
      "country": "Japan",
      "country_code": "JP",
      "lat": 34.6937,
      "lng": 135.5023,
      "arrival_date": "2026-10-10",
      "departure_date": "2026-10-14",
      "nights_staying": 4
    }
  ],
  "itinerary_days": [
    {
      "id": "trip_japan_2026_day_1",
      "trip_id": "trip_japan_2026",
      "destination_id": "dest_tokyo",
      "day_number": 1,
      "date": "2026-10-01",
      "title": "Arrival in Neon City",
      "description": "Welcome to Tokyo. Settle in and explore Shibuya.",
      "estimated_cost": "20.00",
      "activities": [
        {
          "id": "act_jp_001",
          "itinerary_day_id": "trip_japan_2026_day_1",
          "time": "14:00",
          "duration_minutes": 60,
          "title": "Check-in at Shinjuku Hotel",
          "description": "Drop off bags and freshen up.",
          "category": "accommodation",
          "cost": "0.00",
          "booking_required": true,
          "booking_url": null,
          "rating": null,
          "location_name": "Keio Plaza Hotel",
          "location_address": "2-2-1 Nishi-Shinjuku",
          "location_city": "Tokyo",
          "location_lat": 35.6896,
          "location_lng": 139.6922
        },
        {
          "id": "act_jp_002",
          "itinerary_day_id": "trip_japan_2026_day_1",
          "time": "17:00",
          "duration_minutes": 120,
          "title": "Shibuya Crossing & Hachiko",
          "description": "Experience the world's busiest intersection.",
          "category": "sightseeing",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": 4.8,
          "location_name": "Shibuya Scramble Crossing",
          "location_address": "Shibuya City, Tokyo 150-0043",
          "location_city": "Tokyo",
          "location_lat": 35.6595,
          "location_lng": 139.7005
        }
      ],
      "meals": [
        {
          "id": "meal_jp_001",
          "itinerary_day_id": "trip_japan_2026_day_1",
          "time": "19:00",
          "type": "dinner",
          "restaurant_name": "Ichiran Ramen",
          "cuisine": "Japanese",
          "estimated_cost": "20.00",
          "rating": 4.7,
          "location_name": "Ichiran Shibuya",
          "location_address": "1 Chome-22-7 Jinnan",
          "location_city": "Tokyo",
          "location_lat": 35.6611,
          "location_lng": 139.7005
        }
      ]
    },
    {
      "id": "trip_japan_2026_day_2",
      "trip_id": "trip_japan_2026",
      "destination_id": "dest_tokyo",
      "day_number": 2,
      "date": "2026-10-02",
      "title": "Traditional Tokyo",
      "description": "Explore Asakusa and Ueno Park.",
      "estimated_cost": "5.00",
      "activities": [
        {
          "id": "act_jp_003",
          "itinerary_day_id": "trip_japan_2026_day_2",
          "time": "09:00",
          "duration_minutes": 180,
          "title": "Senso-ji Temple",
          "description": "Visit Tokyo's oldest temple and shop at Nakamise.",
          "category": "culture",
          "cost": "5.00",
          "booking_required": false,
          "booking_url": null,
          "rating": 4.9,
          "location_name": "Senso-ji",
          "location_address": "2-3-1 Asakusa",
          "location_city": "Tokyo",
          "location_lat": 35.7148,
          "location_lng": 139.7967
        }
      ],
      "meals": []
    }
  ],
  "accommodations": [
    {
      "id": "acc_tokyo_001",
      "trip_id": "trip_japan_2026",
      "check_in": "2026-10-01",
      "check_out": "2026-10-06",
      "name": "Keio Plaza Hotel",
      "type": "hotel",
      "city": "Tokyo",
      "country_code": "JP",
      "address": "2-2-1 Nishi-Shinjuku",
      "lat": 35.6896,
      "lng": 139.6922,
      "rating": 4.5,
      "price_per_night": "200.00",
      "total_cost": "1000.00",
      "amenities": [
        "Free WiFi",
        "Pool",
        "Gym",
        "Breakfast"
      ],
      "check_in_time": "15:00",
      "check_out_time": "11:00"
    }
  ],
  "transportations": [
    {
      "id": "trans_jp_001",
      "trip_id": "trip_japan_2026",
      "type": "flight",
      "category": "outbound",
      "from_location": "Los Angeles International",
      "to_location": "Narita International",
      "from_city": "Los Angeles",
      "to_city": "Tokyo",
      "departure_time": "2026-09-30T10:00:00Z",
      "arrival_time": "2026-10-01T14:00:00Z",
      "provider": "ANA",
      "flight_number": null,
      "duration_minutes": 660,
      "cost": "1200.00",
      "booking_reference": null
    }
  ]
} satisfies components["schemas"]["TripResponse"];

export default trip;
