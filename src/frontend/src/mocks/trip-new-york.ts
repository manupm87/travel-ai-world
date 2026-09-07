// Fixture in the exact shape of core_api's `TripResponse`. `satisfies` makes the
// compiler reject any drift from the generated contract (enum values included).
import type { TripResponse } from "@/types/trip";

const trip = {
  "id": "trip_ny_2025",
  "user_id": 1,
  "status": "finished",
  "created_at": "2025-08-15T10:30:00Z",
  "updated_at": "2025-10-13T14:45:00Z",
  "title": "New York Weekend",
  "description": "Autumn in Central Park and Broadway shows",
  "image_url": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&q=80",
  "start_date": "2025-10-05",
  "end_date": "2025-10-12",
  "duration_days": 7,
  "travelers_adults": 2,
  "travelers_children": 0,
  "travelers_infants": 0,
  "travel_style": [
    "culture",
    "shopping"
  ],
  "pace_preference": "fast",
  "accommodation_type": "luxury",
  "budget_total": "4500.00",
  "budget_currency": "USD",
  "budget_accommodation": "2000.00",
  "budget_food": "1000.00",
  "budget_activities": "800.00",
  "budget_transportation": "500.00",
  "budget_other": "200.00",
  "ai_weather_forecast": "Crisp autumn air in NYC! Temperatures range from 10-18°C. Bring a light jacket for evening walks in Central Park.",
  "ai_local_tips": [
    "The Subway is your best friend; get an OMNY-compatible card. For the best views, consider 'Top of the Rock' during sunset."
  ],
  "destinations": [
    {
      "id": "dest_ny",
      "trip_id": "trip_ny_2025",
      "city": "New York City",
      "country": "United States",
      "country_code": "US",
      "lat": 40.7128,
      "lng": -74.006,
      "arrival_date": "2025-10-05",
      "departure_date": "2025-10-12",
      "nights_staying": 7
    }
  ],
  "itinerary_days": [
    {
      "id": "trip_ny_2025_day_1",
      "trip_id": "trip_ny_2025",
      "destination_id": "dest_ny",
      "day_number": 1,
      "date": "2025-10-05",
      "title": "Arrival & Times Square",
      "description": "Checking in and feeling the neon vibes of NYC.",
      "estimated_cost": "80.00",
      "activities": [
        {
          "id": "act_ny_001",
          "itinerary_day_id": "trip_ny_2025_day_1",
          "time": "15:00",
          "duration_minutes": 60,
          "title": "Check-in: The Plaza",
          "description": "Check-in available from 3:00 PM",
          "category": "accommodation",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": null,
          "location_name": "The Plaza Hotel",
          "location_address": "768 5th Ave",
          "location_city": "New York City",
          "location_lat": 40.7644,
          "location_lng": -73.9745
        },
        {
          "id": "act_ny_002",
          "itinerary_day_id": "trip_ny_2025_day_1",
          "time": "20:00",
          "duration_minutes": 120,
          "title": "Times Square Walk",
          "description": "Take in the bright lights and energy of Times Square at night.",
          "category": "sightseeing",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": 4.5,
          "location_name": "Times Square",
          "location_address": "Manhattan, NY 10036",
          "location_city": "New York City",
          "location_lat": 40.758,
          "location_lng": -73.9855
        }
      ],
      "meals": [
        {
          "id": "meal_ny_001",
          "itinerary_day_id": "trip_ny_2025_day_1",
          "time": "18:30",
          "type": "dinner",
          "restaurant_name": "Carmine's Italian Restaurant",
          "cuisine": "Italian",
          "estimated_cost": "80.00",
          "rating": 4.6,
          "location_name": "Carmine's",
          "location_address": "200 W 44th St",
          "location_city": "New York City",
          "location_lat": 40.7575,
          "location_lng": -73.9868
        }
      ]
    },
    {
      "id": "trip_ny_2025_day_2",
      "trip_id": "trip_ny_2025",
      "destination_id": "dest_ny",
      "day_number": 2,
      "date": "2025-10-06",
      "title": "Central Park & Museums",
      "description": "A relaxing autumn walk and world-class art.",
      "estimated_cost": "30.00",
      "activities": [
        {
          "id": "act_ny_003",
          "itinerary_day_id": "trip_ny_2025_day_2",
          "time": "09:30",
          "duration_minutes": 180,
          "title": "Central Park Stroll",
          "description": "Walk through Bethesda Terrace, Bow Bridge, and the Mall.",
          "category": "relaxation",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": 4.9,
          "location_name": "Central Park",
          "location_address": "New York, NY",
          "location_city": "New York City",
          "location_lat": 40.7812,
          "location_lng": -73.9665
        },
        {
          "id": "act_ny_004",
          "itinerary_day_id": "trip_ny_2025_day_2",
          "time": "14:00",
          "duration_minutes": 180,
          "title": "The Metropolitan Museum of Art",
          "description": "Explore one of the world's largest and finest art museums.",
          "category": "culture",
          "cost": "30.00",
          "booking_required": true,
          "booking_url": null,
          "rating": 4.8,
          "location_name": "The Met",
          "location_address": "1000 5th Ave",
          "location_city": "New York City",
          "location_lat": 40.7794,
          "location_lng": -73.9632
        }
      ],
      "meals": []
    }
  ],
  "accommodations": [
    {
      "id": "acc_ny_001",
      "trip_id": "trip_ny_2025",
      "check_in": "2025-10-05",
      "check_out": "2025-10-12",
      "name": "The Plaza Hotel",
      "type": "hotel",
      "city": "New York City",
      "country_code": "US",
      "address": "768 5th Ave",
      "lat": 40.7644,
      "lng": -73.9745,
      "rating": 4.8,
      "price_per_night": "400.00",
      "total_cost": "2800.00",
      "amenities": [
        "Luxury",
        "Spa",
        "Central Park Views",
        "Fine Dining"
      ],
      "check_in_time": "15:00",
      "check_out_time": "11:00"
    }
  ],
  "transportations": [
    {
      "id": "trans_ny_001",
      "trip_id": "trip_ny_2025",
      "type": "flight",
      "category": "outbound",
      "from_location": "London Heathrow",
      "to_location": "JFK International",
      "from_city": "London",
      "to_city": "New York City",
      "departure_time": "2025-10-05T09:00:00Z",
      "arrival_time": "2025-10-05T12:00:00Z",
      "provider": "British Airways",
      "flight_number": null,
      "duration_minutes": 480,
      "cost": "600.00",
      "booking_reference": null
    }
  ]
} satisfies TripResponse;

export default trip;
