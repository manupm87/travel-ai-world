export interface TripSummary {
  id: string;
  title: string;
  destinations: string[]; // e.g. ["Paris", "Rome", "Barcelona"]
  startDate: string;
  endDate: string;
  status: "planning" | "planned" | "finished";
  imageUrl: string; 
}
