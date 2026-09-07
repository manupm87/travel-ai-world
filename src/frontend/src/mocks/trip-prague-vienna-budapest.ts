// Fixture in the exact shape of core_api's `TripResponse`. `satisfies` makes the
// compiler reject any drift from the generated contract (enum values included).
import type { TripResponse } from "@/types/trip";

const trip = {
  "id": "trip_prague_vienna_budapest_2024",
  "user_id": 1,
  "status": "finished",
  "created_at": "2024-03-15T10:30:00Z",
  "updated_at": "2024-05-13T14:45:00Z",
  "title": "Prague, Vienna & Budapest",
  "description": "Central European magic across three incredible capitals.",
  "image_url": "https://images.unsplash.com/photo-1616432902940-b7a1acbc60b3?auto=format&fit=crop&q=80",
  "start_date": "2024-05-01",
  "end_date": "2024-05-10",
  "duration_days": 9,
  "travelers_adults": 2,
  "travelers_children": 0,
  "travelers_infants": 0,
  "travel_style": [
    "culture",
    "history",
    "food"
  ],
  "pace_preference": "moderate",
  "accommodation_type": "mid-range",
  "budget_total": "3500.00",
  "budget_currency": "EUR",
  "budget_accommodation": "1500.00",
  "budget_food": "800.00",
  "budget_activities": "600.00",
  "budget_transportation": "400.00",
  "budget_other": "200.00",
  "ai_weather_forecast": "Mild May weather! Prague 12-18°C, Vienna 13-19°C, Budapest 14-20°C. Great for city walking.",
  "ai_local_tips": [
    "Try Trdelník in Prague, Sachertorte in Vienna, and Langos in Budapest. Don't forget to validate your train tickets!"
  ],
  "destinations": [
    {
      "id": "dest_prg",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "city": "Prague",
      "country": "Czech Republic",
      "country_code": "CZ",
      "lat": 50.0755,
      "lng": 14.4378,
      "arrival_date": "2024-05-01",
      "departure_date": "2024-05-04",
      "nights_staying": 3
    },
    {
      "id": "dest_vie",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "city": "Vienna",
      "country": "Austria",
      "country_code": "AT",
      "lat": 48.2082,
      "lng": 16.3738,
      "arrival_date": "2024-05-04",
      "departure_date": "2024-05-07",
      "nights_staying": 3
    },
    {
      "id": "dest_bud",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "city": "Budapest",
      "country": "Hungary",
      "country_code": "HU",
      "lat": 47.4979,
      "lng": 19.0402,
      "arrival_date": "2024-05-07",
      "departure_date": "2024-05-10",
      "nights_staying": 3
    }
  ],
  "itinerary_days": [
    {
      "id": "trip_prague_vienna_budapest_2024_day_1",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "destination_id": "dest_prg",
      "day_number": 1,
      "date": "2024-05-01",
      "title": "Arrival & Old Town Magic",
      "description": "Welcome to Prague! Settle in and explore the charming Old Town Square.",
      "estimated_cost": "30.00",
      "activities": [
        {
          "id": "act_prg_001",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_1",
          "time": "14:00",
          "duration_minutes": 60,
          "title": "Check-in: Grand Hotel Bohemia",
          "description": "Drop off bags and freshen up.",
          "category": "accommodation",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": null,
          "location_name": "Grand Hotel Bohemia",
          "location_address": "Kralodvorska 4",
          "location_city": "Prague",
          "location_lat": 50.0878,
          "location_lng": 14.4265
        },
        {
          "id": "act_prg_002",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_1",
          "time": "16:00",
          "duration_minutes": 120,
          "title": "Astronomical Clock & Old Town Square",
          "description": "Witness the famous clock face and walk the historic center.",
          "category": "sightseeing",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": 4.8,
          "location_name": "Old Town Square",
          "location_address": "Staroměstské nám.",
          "location_city": "Prague",
          "location_lat": 50.0873,
          "location_lng": 14.4211
        }
      ],
      "meals": [
        {
          "id": "meal_prg_001",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_1",
          "time": "19:00",
          "type": "dinner",
          "restaurant_name": "U Pivrnce",
          "cuisine": "Czech Traditional",
          "estimated_cost": "30.00",
          "rating": 4.5,
          "location_name": "U Pivrnce",
          "location_address": "Maiselova 3",
          "location_city": "Prague",
          "location_lat": 50.0888,
          "location_lng": 14.4178
        }
      ]
    },
    {
      "id": "trip_prague_vienna_budapest_2024_day_2",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "destination_id": "dest_prg",
      "day_number": 2,
      "date": "2024-05-02",
      "title": "Prague Castle & Charles Bridge",
      "description": "Discover the majestic Prague Castle overlooking the city.",
      "estimated_cost": "18.00",
      "activities": [
        {
          "id": "act_prg_003",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_2",
          "time": "09:00",
          "duration_minutes": 180,
          "title": "Prague Castle Tour",
          "description": "St Vitus Cathedral, Golden Lane, and royal palaces.",
          "category": "culture",
          "cost": "18.00",
          "booking_required": true,
          "booking_url": null,
          "rating": 4.9,
          "location_name": "Prague Castle",
          "location_address": "Hradčany",
          "location_city": "Prague",
          "location_lat": 50.0903,
          "location_lng": 14.3996
        },
        {
          "id": "act_prg_004",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_2",
          "time": "14:00",
          "duration_minutes": 90,
          "title": "Walk across Charles Bridge",
          "description": "Stroll down to the iconic bridge with 30 statues of saints.",
          "category": "sightseeing",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": 4.8,
          "location_name": "Charles Bridge",
          "location_address": "Karlův most",
          "location_city": "Prague",
          "location_lat": 50.0865,
          "location_lng": 14.4114
        }
      ],
      "meals": []
    },
    {
      "id": "trip_prague_vienna_budapest_2024_day_4",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "destination_id": "dest_vie",
      "day_number": 4,
      "date": "2024-05-04",
      "title": "Train to Vienna",
      "description": "Fast and scenic rail journey south to Austria.",
      "estimated_cost": "25.00",
      "activities": [
        {
          "id": "act_vie_001",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_4",
          "time": "10:30",
          "duration_minutes": 240,
          "title": "RegioJet to Vienna Hbf",
          "description": "Comfortable train ride with complimentary coffee.",
          "category": "transport",
          "cost": "25.00",
          "booking_required": true,
          "booking_url": null,
          "rating": null,
          "location_name": "Praha hlavní nádraží",
          "location_address": "Wilsonova 8",
          "location_city": "Prague",
          "location_lat": 50.0833,
          "location_lng": 14.435
        },
        {
          "id": "act_vie_002",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_4",
          "time": "15:00",
          "duration_minutes": 120,
          "title": "Settle in at Hotel Sacher",
          "description": "Check in and grab a slice of Sachertorte.",
          "category": "accommodation",
          "cost": "0.00",
          "booking_required": false,
          "booking_url": null,
          "rating": null,
          "location_name": "Hotel Sacher",
          "location_address": "Philharmoniker Str. 4",
          "location_city": "Vienna",
          "location_lat": 48.2038,
          "location_lng": 16.3698
        }
      ],
      "meals": []
    },
    {
      "id": "trip_prague_vienna_budapest_2024_day_8",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "destination_id": "dest_bud",
      "day_number": 8,
      "date": "2024-05-08",
      "title": "Budapest Thermal Baths",
      "description": "Unwind in the famous mineral-rich thermal waters.",
      "estimated_cost": "75.00",
      "activities": [
        {
          "id": "act_bud_001",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_8",
          "time": "09:30",
          "duration_minutes": 240,
          "title": "Széchenyi Thermal Bath",
          "description": "Relaxing morning in the massive neo-baroque outdoor pools.",
          "category": "relaxation",
          "cost": "35.00",
          "booking_required": true,
          "booking_url": null,
          "rating": 4.8,
          "location_name": "Széchenyi Baths",
          "location_address": "Állatkerti krt. 9-11",
          "location_city": "Budapest",
          "location_lat": 47.5186,
          "location_lng": 19.0823
        }
      ],
      "meals": [
        {
          "id": "meal_bud_001",
          "itinerary_day_id": "trip_prague_vienna_budapest_2024_day_8",
          "time": "20:00",
          "type": "dinner",
          "restaurant_name": "Mazel Tov",
          "cuisine": "Middle Eastern / Ruin Bar",
          "estimated_cost": "40.00",
          "rating": 4.7,
          "location_name": "Mazel Tov",
          "location_address": "Akácfa u. 47",
          "location_city": "Budapest",
          "location_lat": 47.5015,
          "location_lng": 19.0655
        }
      ]
    }
  ],
  "accommodations": [
    {
      "id": "acc_prg",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "check_in": "2024-05-01",
      "check_out": "2024-05-04",
      "name": "Grand Hotel Bohemia",
      "type": "hotel",
      "city": "Prague",
      "country_code": "CZ",
      "address": "Kralodvorska 4",
      "lat": 50.0878,
      "lng": 14.4265,
      "rating": 4.7,
      "price_per_night": "150.00",
      "total_cost": "450.00",
      "amenities": [
        "City Center",
        "Breakfast Included"
      ],
      "check_in_time": "14:00",
      "check_out_time": "11:00"
    },
    {
      "id": "acc_vie",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "check_in": "2024-05-04",
      "check_out": "2024-05-07",
      "name": "Hotel Sacher",
      "type": "hotel",
      "city": "Vienna",
      "country_code": "AT",
      "address": "Philharmoniker Str. 4",
      "lat": 48.2038,
      "lng": 16.3698,
      "rating": 4.9,
      "price_per_night": "300.00",
      "total_cost": "900.00",
      "amenities": [
        "Luxury",
        "Spa",
        "Historic"
      ],
      "check_in_time": "15:00",
      "check_out_time": "12:00"
    },
    {
      "id": "acc_bud",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "check_in": "2024-05-07",
      "check_out": "2024-05-10",
      "name": "Aria Hotel Budapest",
      "type": "hotel",
      "city": "Budapest",
      "country_code": "HU",
      "address": "Hercegprímás u. 5",
      "lat": 47.5008,
      "lng": 19.0526,
      "rating": 4.9,
      "price_per_night": "250.00",
      "total_cost": "750.00",
      "amenities": [
        "Rooftop Bar",
        "Spa",
        "Music Theme",
        "Breakfast Included"
      ],
      "check_in_time": "15:00",
      "check_out_time": "12:00"
    }
  ],
  "transportations": [
    {
      "id": "trans_prg_vie",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "type": "train",
      "category": "internal",
      "from_location": "Praha hlavní nádraží",
      "to_location": "Vienna Hauptbahnhof",
      "from_city": "Prague",
      "to_city": "Vienna",
      "departure_time": "2024-05-04T10:30:00Z",
      "arrival_time": "2024-05-04T14:30:00Z",
      "provider": "RegioJet",
      "flight_number": null,
      "duration_minutes": 240,
      "cost": "50.00",
      "booking_reference": null
    },
    {
      "id": "trans_vie_bud",
      "trip_id": "trip_prague_vienna_budapest_2024",
      "type": "train",
      "category": "internal",
      "from_location": "Vienna Hauptbahnhof",
      "to_location": "Budapest Keleti",
      "from_city": "Vienna",
      "to_city": "Budapest",
      "departure_time": "2024-05-07T09:40:00Z",
      "arrival_time": "2024-05-07T12:19:00Z",
      "provider": "OBB Railjet",
      "flight_number": null,
      "duration_minutes": 159,
      "cost": "45.00",
      "booking_reference": null
    }
  ]
} satisfies TripResponse;

export default trip;
