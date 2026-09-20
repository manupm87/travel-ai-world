import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./http";
import { listCities } from "./planner";
import { clearSession, writeSession } from "./session";

// The list comes from ai_api; without its URL the page keeps its built-in
// copy, so the network path is exercised with the backend "configured".
let aiAvailable = true;
vi.mock("./http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./http")>();
  return { ...actual, isAiAvailable: () => aiAvailable };
});

const BUDAPEST = {
  slug: "budapest",
  name: "Budapest",
  centre: [47.4979, 19.0402],
  timezone: "Europe/Budapest",
  intro: {
    en: {
      text: "Budapest is the capital city of Hungary.",
      source_url: "https://en.wikivoyage.org/wiki/Budapest",
    },
  },
  image_url: "https://commons.wikimedia.org/w/index.php?title=Special:FilePath/B.jpg",
  image_credit: "Someone (CC BY 2.0) · Wikimedia Commons",
};

/** What a backend deployed before TRA-182 answers: no overview fields. */
const OLD_SHAPE = {
  slug: "bologna",
  name: "Bologna",
  centre: [44.4939, 11.3428],
  timezone: "Europe/Rome",
};

describe("listCities", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    aiAvailable = true;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("asks ai_api with the bearer token and returns the cities", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([BUDAPEST]), { status: 200 })
    );

    const cities = await listCities();

    expect(cities).toEqual([BUDAPEST]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/ai\/planner\/cities$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("drops entries that are not cities", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([BUDAPEST, { slug: 3 }, "x"]), { status: 200 })
    );

    expect(await listCities()).toEqual([BUDAPEST]);
  });

  it("fills the overview fields a backend without them does not send", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([OLD_SHAPE, { ...BUDAPEST, intro: "nope" }]), {
        status: 200,
      })
    );

    const cities = await listCities();

    expect(cities).toHaveLength(2);
    expect(cities[0]).toEqual({ ...OLD_SHAPE, intro: {}, image_url: null, image_credit: null });
    // A field of the wrong type is as good as missing; the rest is kept.
    expect(cities[1]?.intro).toEqual({});
    expect(cities[1]?.image_url).toBe(BUDAPEST.image_url);
  });

  it("answers an empty list without a request when ai_api is not configured", async () => {
    aiAvailable = false;

    expect(await listCities()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a failure propagate as an ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "down" }), { status: 503 })
    );

    await expect(listCities()).rejects.toBeInstanceOf(ApiError);
  });
});
