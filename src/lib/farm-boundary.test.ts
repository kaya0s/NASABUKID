import { describe, expect, it } from "vitest";
import { measureFarmBoundary } from "./farm-boundary";

const latitude = 8;
const height = ((100 / 6371008.8) * 180) / Math.PI;
const width = height / Math.cos((latitude * Math.PI) / 180);
const square = [
  { latitude, longitude: 125 },
  { latitude, longitude: 125 + width },
  { latitude: latitude + height, longitude: 125 + width },
  { latitude: latitude + height, longitude: 125 },
];
describe("Farm boundary measurements", () => {
  it("measures a roughly 100 by 100 metre field as one hectare in either drawing direction", () => {
    expect(measureFarmBoundary(square).hectares).toBeCloseTo(1, 4);
    expect(measureFarmBoundary([...square].reverse()).hectares).toBeCloseTo(1, 4);
    expect(measureFarmBoundary(square).reference.latitude).toBeCloseTo(latitude + height / 2, 8);
  });
  it("rejects self-crossing, degenerate, invalid and oversized outlines", () => {
    expect(() => measureFarmBoundary([square[0], square[2], square[1], square[3]])).toThrow(
      "cross",
    );
    expect(() => measureFarmBoundary([square[0], square[1], square[1]])).toThrow();
    expect(() => measureFarmBoundary(square.slice(0, 2))).toThrow();
    expect(() => measureFarmBoundary([{ latitude: 91, longitude: 0 }, ...square])).toThrow();
    expect(() =>
      measureFarmBoundary([
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 3 },
        { latitude: 1, longitude: 0 },
      ]),
    ).toThrow("local farm");
  });
});
