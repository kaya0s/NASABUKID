import { expect, it } from "vitest";
import { plainAdvisorText } from "./advisor-text";
it("removes headings, emphasis and list markers while preserving paragraph text", () => {
  expect(
    plainAdvisorText(
      "## **Corn**\n* Plant after harvest.\n- Check drainage.\n1. Test soil pH.\n> _Confirm locally._",
    ),
  ).toBe("Corn\nPlant after harvest.\nCheck drainage.\nTest soil pH.\nConfirm locally.");
});
it("keeps numbers, negatives, units, multiplication and research links intact", () => {
  expect(
    plainAdvisorText(
      "**pH 5.1**; 4.2 * 6000 * 0.35 = ₱15,876.\n-5 °C\n- 5 °C\n[FAO](https://www.fao.org/4/s2022e/s2022e07.htm)",
    ),
  ).toBe(
    "pH 5.1; 4.2 × 6000 × 0.35 = ₱15,876.\n-5 °C\n- 5 °C\nFAO (https://www.fao.org/4/s2022e/s2022e07.htm)",
  );
});
it("cleans code fences and separators without changing Bisaya or decimal values", () => {
  expect(plainAdvisorText("```text\n**Mais** ang ikonsiderar.\n```\n---\n1.5 ha; `pH 5.1`.")).toBe(
    "Mais ang ikonsiderar.\n\n1.5 ha; pH 5.1.",
  );
});
