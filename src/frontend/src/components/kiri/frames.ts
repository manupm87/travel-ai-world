/**
 * Kiri's frames: 16 x 18 pixel art (16 x 26 with the handle out), one per state,
 * transcribed from the design canvas (board "Kiri, variantes", TRA-235).
 * Each frame is a list of layers: a colour key (see `KIRI_COLOURS` in Kiri.tsx)
 * and one SVG path of 1 x 1 squares in that colour.
 */

export type KiriState =
  | "idle"
  | "blink"
  | "look"
  | "thinking"
  | "searching"
  | "dragging"
  | "handle"
  | "happy"
  | "lost"
  | "asleep"
  | "stickers";

export type KiriColour =
  | "o" | "l" | "b" | "d" | "w" | "e" | "p" | "s" | "t" | "k" | "g" | "z" | "c" | "1" | "2" | "3";

export interface KiriFrame {
  width: number;
  height: number;
  layers: ReadonlyArray<readonly [KiriColour, string]>;
}

export const KIRI_FRAMES: Record<KiriState, KiriFrame> = {
  idle: {
    width: 16,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h1v1h-1zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h2v1h-2zM7 8h2v1h-2zM10 8h2v1h-2zM2 9h5v1h-5zM9 9h4v1h-4zM2 10h11v1h-11zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["w", "M4 6h2v1h-2zM10 6h2v1h-2zM4 7h1v1h-1zM10 7h1v1h-1zM5 13h1v1h-1z"],
      ["e", "M5 7h1v1h-1zM11 7h1v1h-1zM6 8h1v1h-1zM9 8h1v1h-1zM7 9h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  blink: {
    width: 16,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h11v1h-11zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h2v1h-2zM7 8h2v1h-2zM10 8h2v1h-2zM2 9h5v1h-5zM9 9h4v1h-4zM2 10h11v1h-11zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["e", "M4 7h2v1h-2zM10 7h2v1h-2zM6 8h1v1h-1zM9 8h1v1h-1zM7 9h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["w", "M5 13h1v1h-1z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  look: {
    width: 16,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h1v1h-1zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h2v1h-2zM7 8h2v1h-2zM10 8h2v1h-2zM2 9h5v1h-5zM9 9h4v1h-4zM2 10h11v1h-11zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["w", "M4 6h1v1h-1zM10 6h1v1h-1zM4 7h2v1h-2zM10 7h2v1h-2zM5 13h1v1h-1z"],
      ["e", "M5 6h1v1h-1zM11 6h1v1h-1zM6 8h1v1h-1zM9 8h1v1h-1zM7 9h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  thinking: {
    width: 22,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["z", "M19 0h3v1h-3zM19 1h3v1h-3zM19 2h3v1h-3zM17 3h2v1h-2zM17 4h2v1h-2zM16 5h1v1h-1z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h1v1h-1zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h8v1h-8zM2 9h6v1h-6zM10 9h3v1h-3zM2 10h11v1h-11zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["w", "M4 6h1v1h-1zM10 6h1v1h-1zM4 7h2v1h-2zM10 7h2v1h-2zM5 13h1v1h-1z"],
      ["e", "M5 6h1v1h-1zM11 6h1v1h-1zM8 9h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  searching: {
    width: 16,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h7v1h-7zM12 5h1v1h-1zM2 6h2v1h-2zM6 6h3v1h-3zM2 7h2v1h-2zM6 7h3v1h-3zM2 8h1v1h-1zM4 8h6v1h-6zM2 9h5v1h-5zM9 9h3v1h-3zM2 10h11v1h-11zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["g", "M10 5h2v1h-2zM9 6h1v1h-1zM12 6h1v1h-1zM9 7h1v1h-1zM12 7h1v1h-1zM10 8h2v1h-2zM12 9h1v1h-1zM13 10h1v1h-1zM14 11h1v1h-1zM15 12h1v1h-1z"],
      ["w", "M4 6h2v1h-2zM10 6h2v1h-2zM4 7h1v1h-1zM10 7h1v1h-1zM5 13h1v1h-1z"],
      ["e", "M5 7h1v1h-1zM11 7h1v1h-1zM7 9h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  dragging: {
    width: 16,
    height: 26,
    layers: [
      ["k", "M3 0h10v1h-10zM3 1h1v1h-1zM12 1h1v1h-1zM3 25h2v1h-2zM11 25h2v1h-2z"],
      ["g", "M3 2h1v1h-1zM12 2h1v1h-1zM3 3h1v1h-1zM12 3h1v1h-1zM3 4h1v1h-1zM12 4h1v1h-1zM3 5h1v1h-1zM12 5h1v1h-1zM3 6h1v1h-1zM12 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1z"],
      ["o", "M6 8h4v1h-4zM5 9h1v1h-1zM10 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM2 11h12v1h-12zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM1 16h1v1h-1zM14 16h1v1h-1zM1 17h1v1h-1zM14 17h1v1h-1zM1 18h1v1h-1zM14 18h1v1h-1zM1 19h1v1h-1zM14 19h1v1h-1zM1 20h1v1h-1zM14 20h1v1h-1zM1 21h1v1h-1zM14 21h1v1h-1zM1 22h1v1h-1zM14 22h1v1h-1zM1 23h1v1h-1zM14 23h1v1h-1zM2 24h12v1h-12z"],
      ["l", "M2 12h3v1h-3zM2 13h1v1h-1z"],
      ["b", "M5 12h8v1h-8zM3 13h10v1h-10zM2 14h2v1h-2zM6 14h4v1h-4zM12 14h1v1h-1zM2 15h1v1h-1zM4 15h2v1h-2zM7 15h2v1h-2zM10 15h2v1h-2zM2 16h1v1h-1zM4 16h2v1h-2zM10 16h2v1h-2zM2 17h4v1h-4zM10 17h3v1h-3zM2 18h5v1h-5zM9 18h4v1h-4zM2 20h2v1h-2zM7 20h6v1h-6zM2 21h2v1h-2zM7 21h6v1h-6zM2 22h2v1h-2zM7 22h6v1h-6z"],
      ["d", "M13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM13 15h1v1h-1zM13 16h1v1h-1zM13 17h1v1h-1zM13 18h1v1h-1zM13 20h1v1h-1zM13 21h1v1h-1zM13 22h1v1h-1zM2 23h12v1h-12z"],
      ["e", "M4 14h2v1h-2zM10 14h2v1h-2zM3 15h1v1h-1zM6 15h1v1h-1zM9 15h1v1h-1zM12 15h1v1h-1zM6 16h4v1h-4zM6 17h1v1h-1zM9 17h1v1h-1zM7 18h2v1h-2z"],
      ["p", "M3 16h1v1h-1zM12 16h1v1h-1zM7 17h2v1h-2z"],
      ["s", "M2 19h12v1h-12z"],
      ["t", "M4 20h3v1h-3zM4 21h1v1h-1zM6 21h1v1h-1zM4 22h3v1h-3z"],
      ["w", "M5 21h1v1h-1z"],
    ],
  },
  handle: {
    width: 16,
    height: 26,
    layers: [
      ["k", "M3 0h10v1h-10zM3 1h1v1h-1zM12 1h1v1h-1zM3 25h2v1h-2zM11 25h2v1h-2z"],
      ["g", "M3 2h1v1h-1zM12 2h1v1h-1zM3 3h1v1h-1zM12 3h1v1h-1zM3 4h1v1h-1zM12 4h1v1h-1zM3 5h1v1h-1zM12 5h1v1h-1zM3 6h1v1h-1zM12 6h1v1h-1zM3 7h1v1h-1zM12 7h1v1h-1z"],
      ["o", "M6 8h4v1h-4zM5 9h1v1h-1zM10 9h1v1h-1zM5 10h1v1h-1zM10 10h1v1h-1zM2 11h12v1h-12zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM1 16h1v1h-1zM14 16h1v1h-1zM1 17h1v1h-1zM14 17h1v1h-1zM1 18h1v1h-1zM14 18h1v1h-1zM1 19h1v1h-1zM14 19h1v1h-1zM1 20h1v1h-1zM14 20h1v1h-1zM1 21h1v1h-1zM14 21h1v1h-1zM1 22h1v1h-1zM14 22h1v1h-1zM1 23h1v1h-1zM14 23h1v1h-1zM2 24h12v1h-12z"],
      ["l", "M2 12h3v1h-3zM2 13h1v1h-1z"],
      ["b", "M5 12h8v1h-8zM3 13h10v1h-10zM2 14h2v1h-2zM6 14h4v1h-4zM12 14h1v1h-1zM2 15h2v1h-2zM6 15h4v1h-4zM12 15h1v1h-1zM2 16h1v1h-1zM4 16h2v1h-2zM7 16h2v1h-2zM10 16h2v1h-2zM2 17h5v1h-5zM9 17h4v1h-4zM2 18h11v1h-11zM2 20h2v1h-2zM7 20h6v1h-6zM2 21h2v1h-2zM7 21h6v1h-6zM2 22h2v1h-2zM7 22h6v1h-6z"],
      ["d", "M13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM13 15h1v1h-1zM13 16h1v1h-1zM13 17h1v1h-1zM13 18h1v1h-1zM13 20h1v1h-1zM13 21h1v1h-1zM13 22h1v1h-1zM2 23h12v1h-12z"],
      ["w", "M4 14h2v1h-2zM10 14h2v1h-2zM4 15h1v1h-1zM10 15h1v1h-1zM5 21h1v1h-1z"],
      ["e", "M5 15h1v1h-1zM11 15h1v1h-1zM6 16h1v1h-1zM9 16h1v1h-1zM7 17h2v1h-2z"],
      ["p", "M3 16h1v1h-1zM12 16h1v1h-1z"],
      ["s", "M2 19h12v1h-12z"],
      ["t", "M4 20h3v1h-3zM4 21h1v1h-1zM6 21h1v1h-1zM4 22h3v1h-3z"],
    ],
  },
  happy: {
    width: 16,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["z", "M13 0h1v1h-1zM12 1h3v1h-3zM13 2h1v1h-1z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h1v1h-1zM2 7h1v1h-1zM4 7h2v1h-2zM7 7h2v1h-2zM10 7h2v1h-2zM2 8h1v1h-1zM4 8h2v1h-2zM10 8h2v1h-2zM2 9h4v1h-4zM10 9h3v1h-3zM2 10h5v1h-5zM9 10h4v1h-4zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["e", "M4 6h2v1h-2zM10 6h2v1h-2zM3 7h1v1h-1zM6 7h1v1h-1zM9 7h1v1h-1zM12 7h1v1h-1zM6 8h4v1h-4zM6 9h1v1h-1zM9 9h1v1h-1zM7 10h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1zM7 9h2v1h-2z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["w", "M5 13h1v1h-1z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  lost: {
    width: 18,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["c", "M16 2h1v1h-1zM16 3h1v1h-1zM15 4h3v1h-3zM15 5h3v1h-3zM16 6h1v1h-1z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["e", "M5 4h1v1h-1zM10 4h1v1h-1zM4 5h1v1h-1zM11 5h1v1h-1zM4 7h1v1h-1zM10 7h1v1h-1zM6 9h1v1h-1zM8 9h1v1h-1zM7 10h1v1h-1zM9 10h1v1h-1z"],
      ["b", "M6 4h4v1h-4zM11 4h2v1h-2zM3 5h1v1h-1zM5 5h6v1h-6zM12 5h1v1h-1zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h1v1h-1zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h8v1h-8zM2 9h4v1h-4zM7 9h1v1h-1zM9 9h4v1h-4zM2 10h5v1h-5zM8 10h1v1h-1zM10 10h3v1h-3zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["w", "M4 6h2v1h-2zM10 6h2v1h-2zM5 7h1v1h-1zM11 7h1v1h-1zM5 13h1v1h-1z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  asleep: {
    width: 22,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["z", "M18 0h4v1h-4zM20 1h1v1h-1zM19 2h1v1h-1zM18 3h4v1h-4zM16 4h3v1h-3zM17 5h1v1h-1zM16 6h3v1h-3z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h11v1h-11zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h8v1h-8zM2 9h5v1h-5zM8 9h5v1h-5zM2 10h11v1h-11zM2 12h2v1h-2zM7 12h6v1h-6zM2 13h2v1h-2zM7 13h6v1h-6zM2 14h2v1h-2zM7 14h6v1h-6z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["e", "M4 7h2v1h-2zM10 7h2v1h-2zM7 9h1v1h-1z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["t", "M4 12h3v1h-3zM4 13h1v1h-1zM6 13h1v1h-1zM4 14h3v1h-3z"],
      ["w", "M5 13h1v1h-1z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
  stickers: {
    width: 16,
    height: 18,
    layers: [
      ["o", "M6 0h4v1h-4zM5 1h1v1h-1zM10 1h1v1h-1zM5 2h1v1h-1zM10 2h1v1h-1zM2 3h12v1h-12zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h1v1h-1zM14 13h1v1h-1zM1 14h1v1h-1zM14 14h1v1h-1zM1 15h1v1h-1zM14 15h1v1h-1zM2 16h12v1h-12z"],
      ["l", "M2 4h3v1h-3zM2 5h1v1h-1z"],
      ["b", "M5 4h8v1h-8zM3 5h10v1h-10zM2 6h2v1h-2zM6 6h4v1h-4zM12 6h1v1h-1zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h1v1h-1zM2 8h1v1h-1zM4 8h2v1h-2zM7 8h2v1h-2zM10 8h2v1h-2zM2 9h5v1h-5zM9 9h4v1h-4zM2 10h11v1h-11zM4 12h1v1h-1zM7 12h2v1h-2zM12 12h1v1h-1zM4 13h1v1h-1zM7 13h2v1h-2zM12 13h1v1h-1zM2 14h3v1h-3zM7 14h2v1h-2zM12 14h1v1h-1z"],
      ["d", "M13 4h1v1h-1zM13 5h1v1h-1zM13 6h1v1h-1zM13 7h1v1h-1zM13 8h1v1h-1zM13 9h1v1h-1zM13 10h1v1h-1zM13 12h1v1h-1zM13 13h1v1h-1zM13 14h1v1h-1zM2 15h12v1h-12z"],
      ["w", "M4 6h2v1h-2zM10 6h2v1h-2zM4 7h1v1h-1zM10 7h1v1h-1zM10 13h1v1h-1z"],
      ["e", "M5 7h1v1h-1zM11 7h1v1h-1zM6 8h1v1h-1zM9 8h1v1h-1zM7 9h2v1h-2z"],
      ["p", "M3 8h1v1h-1zM12 8h1v1h-1z"],
      ["s", "M2 11h12v1h-12z"],
      ["1", "M2 12h2v1h-2zM2 13h2v1h-2z"],
      ["2", "M5 12h2v1h-2zM5 13h2v1h-2zM5 14h2v1h-2z"],
      ["3", "M9 12h3v1h-3zM9 13h1v1h-1zM11 13h1v1h-1zM9 14h3v1h-3z"],
      ["k", "M3 17h2v1h-2zM11 17h2v1h-2z"],
    ],
  },
};

/** The face alone, for the closed suitcase on the boarding pass. */
export const KIRI_FACE: KiriFrame = {
  width: 12,
  height: 6,
  layers: [
    ["e", "M2 0h2v1h-2zM8 0h2v1h-2zM1 1h1v1h-1zM4 1h1v1h-1zM7 1h1v1h-1zM10 1h1v1h-1zM4 3h4v1h-4zM4 4h1v1h-1zM7 4h1v1h-1zM5 5h2v1h-2z"],
    ["p", "M0 2h1v1h-1zM11 2h1v1h-1zM5 4h2v1h-2z"],
  ],
};
