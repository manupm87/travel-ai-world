import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./http";
import { getCardDetail } from "./planner";
import { clearSession, writeSession } from "./session";

// The detail comes from ai_api; without its URL the panel shows the card it
// already has, so the network path is exercised with the backend "configured".
let aiAvailable = true;
vi.mock("./http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./http")>();
  return { ...actual, isAiAvailable: () => aiAvailable };
});

const ID = "wv:en:Budapest/Ferencváros#do:great-market-hall";

const DETAIL = {
  id: ID,
  title: "Great Market Hall",
  subtitle: null,
  district: "Ferencváros",
  category: "buy",
  image_url: null,
  image_credit: null,
  price_tier: null,
  rating_text: null,
  hours: "06:00–18:00",
  lat: 47.4871,
  lon: 19.0587,
  why: "",
  source: "Wikivoyage",
  source_url: "https://en.wikivoyage.org/wiki/Budapest/Ferencv%C3%A1ros#Do",
  license: "CC BY-SA 4.0",
  deep_link: null,
  description: "A three-storey market hall of 1897.",
  heading_path: "Budapest/Ferencváros > Do",
  address: "Vámház körút 1–3, 1093 Budapest",
  phone: "+36 1 366 3300",
  website: "https://piaconline.hu/",
};

describe("getCardDetail", () => {
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

  it("asks ai_api for the card with the bearer token and the id in the query", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(DETAIL), { status: 200 }));

    expect(await getCardDetail(ID)).toEqual(DETAIL);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/ai/planner/card?id=${encodeURIComponent(ID)}`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("fills the fields the answer leaves out, and refuses one without an id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: ID, title: "Great Market Hall" }), { status: 200 })
    );

    expect(await getCardDetail(ID)).toMatchObject({
      id: ID,
      description: "",
      address: null,
      phone: null,
      website: null,
      why: "",
    });

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ title: "no id" }), { status: 200 }));
    expect(await getCardDetail(ID)).toBeNull();
  });

  it("answers `null` without a request when ai_api is not configured", async () => {
    aiAvailable = false;

    expect(await getCardDetail(ID)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers `null` when the route is not deployed or the id is unknown", async () => {
    for (const status of [404, 405]) {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ detail: "Not Found" }), { status })
      );
      expect(await getCardDetail(ID)).toBeNull();
    }
  });

  it("lets any other failure propagate as an ApiError", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "down" }), { status: 503 }));

    await expect(getCardDetail(ID)).rejects.toBeInstanceOf(ApiError);
  });
});
