import { describe, expect, it } from "vitest";
import { makeTripSummary } from "@/test/fixtures";
import { stickerCities } from "./suitcase";

describe("stickerCities", () => {
  it("gives one sticker per city, in order, whatever the case", () => {
    const trips = [
      makeTripSummary({ id: "a", city: "Budapest" }),
      makeTripSummary({ id: "b", city: "Bologna" }),
      makeTripSummary({ id: "c", city: "budapest " }),
      makeTripSummary({ id: "d", city: "" }),
    ];
    expect(stickerCities(trips)).toEqual(["Budapest", "Bologna"]);
  });
});
