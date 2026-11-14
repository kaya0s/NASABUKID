import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CROP_RESEARCH, ROTATION_RESEARCH } from "@/lib/crop-research";
import { ROTATIONS } from "@/lib/fieldshift-demo";
import { RotationResearch } from "./rotation-research";
afterEach(cleanup);
it("provides linked published evidence for every displayed rotation without claiming it proves the ranking", () => {
  for (const rotation of ROTATIONS) {
    const evidence = ROTATION_RESEARCH[rotation.id];
    expect(evidence).toBeDefined();
    for (const id of evidence!.sources) expect(CROP_RESEARCH[id].url).toMatch(/^https:\/\//);
  }
  render(<RotationResearch rotationId="legume" drainage="Good" />);
  expect(screen.getByText(/None of the cited studies establishes/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Research findings & references"));
  expect(screen.getByText(/1.36 t\/ha/)).toBeInTheDocument();
  expect(
    screen.getByText(/no statistically significant treatment differences/),
  ).toBeInTheDocument();
  expect(screen.getByText(/maize 500–800 mm and sorghum\/millet 450–650 mm/)).toBeInTheDocument();
  expect(screen.getByText(/not monthly rainfall thresholds/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Gatan & Gatan/ })).toHaveAttribute(
    "href",
    expect.stringContaining("article/download/760/201"),
  );
});
it("shows the adverse sweetpotato evidence rather than treating a high demo score as flood tolerance", () => {
  render(<RotationResearch rotationId="root-crop" drainage="Poor" />);
  expect(screen.getByText("Drainage needs verification.")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Research findings & references"));
  expect(screen.getByText(/40.05% in 2022 and 40.80% in 2023/)).toBeInTheDocument();
  expect(screen.getByText(/not loss estimates for this farm/)).toBeInTheDocument();
});
