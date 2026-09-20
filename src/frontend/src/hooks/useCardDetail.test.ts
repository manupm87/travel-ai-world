import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/services/http";
import { getCardDetail } from "@/services/planner";
import { ACTIVITIES } from "@/data/planner-demo/session";
import type { CardDetail } from "@/types/planner";
import { clearCardDetailCache, useCardDetail } from "./useCardDetail";

vi.mock("@/services/planner", () => ({
  getCardDetail: vi.fn(),
}));

const getCardDetailMock = vi.mocked(getCardDetail);

const card = ACTIVITIES.greatMarket;
const other = ACTIVITIES.synagogue;

const detailFor = (id: string): CardDetail => ({
  ...card,
  id,
  description: "A three-storey market hall of 1897.",
  heading_path: null,
  address: "Vámház körút 1–3",
  phone: null,
  website: null,
});

describe("useCardDetail", () => {
  beforeEach(() => {
    getCardDetailMock.mockReset();
    clearCardDetailCache();
  });

  it("is idle with nothing selected, and asks for nothing", () => {
    const { result } = renderHook(() => useCardDetail(null));

    expect(result.current).toEqual({ detail: null, status: "idle" });
    expect(getCardDetailMock).not.toHaveBeenCalled();
  });

  it("loads the detail of the selected card", async () => {
    const detail = detailFor(card.id);
    getCardDetailMock.mockResolvedValue(detail);

    const { result } = renderHook(() => useCardDetail(card.id));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.detail).toEqual(detail);
    expect(getCardDetailMock).toHaveBeenCalledWith(card.id, { signal: expect.any(AbortSignal) });
  });

  it("reports `unavailable` when there is no detail to be had (demo mode)", async () => {
    getCardDetailMock.mockResolvedValue(null);

    const { result } = renderHook(() => useCardDetail(card.id));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.detail).toBeNull();
  });

  it("reports an error without a detail when the call fails", async () => {
    getCardDetailMock.mockRejectedValue(new ApiError(503, "down"));

    const { result } = renderHook(() => useCardDetail(card.id));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.detail).toBeNull();
  });

  it("aborts the call in flight when another card is selected", async () => {
    getCardDetailMock.mockImplementation(
      (id) => new Promise((resolve) => setTimeout(() => resolve(detailFor(id)), 10))
    );

    const { result, rerender } = renderHook(({ id }: { id: string }) => useCardDetail(id), {
      initialProps: { id: card.id },
    });

    rerender({ id: other.id });

    // The first request was abandoned, and the state describes the new card
    // from the very first render after the swap.
    const firstSignal = getCardDetailMock.mock.calls[0]![1]!.signal!;
    expect(firstSignal.aborted).toBe(true);
    expect(result.current).toEqual({ detail: null, status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.detail?.id).toBe(other.id);
  });

  it("serves a card it has already loaded from the cache, without asking again", async () => {
    getCardDetailMock.mockResolvedValue(detailFor(card.id));

    const first = renderHook(() => useCardDetail(card.id));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();

    const second = renderHook(() => useCardDetail(card.id));

    // Ready on the first render: no skeleton, no second request.
    expect(second.result.current.status).toBe("ready");
    expect(getCardDetailMock).toHaveBeenCalledTimes(1);
  });
});
