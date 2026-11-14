import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { rotationsForFarm } from "@/lib/fieldshift-demo";
import { RotationEvidence } from "./rotation-evidence";
const farm = {
  ph: "6.1",
  soil: "Clay loam",
  drainage: "Good",
  irrigation: "Rain-fed",
  planted: "2026-06-15",
};
const rotation = rotationsForFarm("Typical", { ...farm, ph: 6.1 })[0]!;
afterEach(cleanup);
it("distinguishes demo ratings from observed NASA data and explains the actual weighted score", () => {
  render(<RotationEvidence rotation={rotation} farm={farm} historical={null} />);
  const summary = screen.getByText("Evidence & assumptions");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(summary);
  expect(screen.getByText(/No historical NASA year has been applied/)).toBeInTheDocument();
  expect(screen.getByText(`${rotation.total} / 100`)).toBeInTheDocument();
  expect(screen.getByText(`Water: ${rotation.scores.water} × 30%`)).toBeInTheDocument();
  expect(screen.getByText(/Crop suitability, planting windows/)).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /NASA POWER historical records/ }),
  ).not.toBeInTheDocument();
});
it("links the exact applied historical source rather than implying every displayed chart affects ranking", () => {
  render(
    <RotationEvidence
      rotation={rotation}
      farm={farm}
      historical={{
        latitude: 8.3,
        longitude: 125,
        start: "2024-01-01",
        end: "2024-12-31",
        retrievedAt: "2026-11-08T00:00:00Z",
        sourceUrl: "https://power.larc.nasa.gov/api/temporal/daily/point?latitude=8.3",
        days: [],
      }}
    />,
  );
  fireEvent.click(screen.getByText("Evidence & assumptions"));
  expect(screen.getByRole("link", { name: /NASA POWER historical records/ })).toHaveAttribute(
    "href",
    expect.stringContaining("latitude=8.3"),
  );
  expect(screen.getByText(/2024-01-01 to 2024-12-31/)).toBeInTheDocument();
  expect(screen.getByText(/Complete planting-month rainfall is unavailable/)).toBeInTheDocument();
});
