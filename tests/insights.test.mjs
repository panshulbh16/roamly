import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["lib/trips/insights.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { getPackingCues, getTripSignature } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64"),
);

test("trip DNA follows the strongest interest combination", () => {
  const signature = getTripSignature({
    days: 5,
    budget: "Comfort",
    pace: "Balanced",
    interests: ["Culture", "Food"],
  });
  assert.equal(signature.name, "Taste & texture");
  assert.match(signature.line, /5-day escape/);
  assert.deepEqual(signature.signals, ["Culture + Food", "5 days", "Balanced"]);
});

test("packing cues stay bounded and respect practical needs", () => {
  const cues = getPackingCues({
    interests: ["Nature", "Photography", "Food"],
    needs: "step-free routes",
  });
  assert.ok(cues.length <= 6);
  assert.ok(cues.includes("Comfortable shoes for changing ground"));
  assert.ok(cues.includes("Save accessibility notes offline"));
});

test("signatures cover every supported duration, budget, pace and interest combination", () => {
  const interests = ["Nature", "Food", "Culture", "Adventure", "Photography", "Relaxation"];
  for (let mask = 0; mask < 64; mask++) {
    const selected = interests.filter((_, i) => mask & (1 << i));
    const has = (interest) => selected.includes(interest);
    const expectedName = has("Nature") && has("Adventure") ? "Wild & wide" : has("Food") && has("Culture") ? "Taste & texture" : has("Photography") ? "Light chaser" : has("Relaxation") ? "Slow horizon" : "Curious original";
    for (let days = 1; days <= 10; days++) {
      for (const pace of ["Relaxed", "Balanced", "Packed"]) {
        for (const budget of ["Budget", "Comfort", "Luxury"]) {
          const result = getTripSignature({ days, pace, budget, interests: selected });
          assert.equal(result.name, expectedName);
          assert.ok(result.line.startsWith(`${days}-day escape`));
          assert.equal(result.signals[1], `${days} ${days === 1 ? "day" : "days"}`);
          assert.equal(result.signals[2], pace);
          assert.match(result.line, pace === "Relaxed" ? /room to wander/ : pace === "Packed" ? /full days/ : /steady rhythm/);
          assert.match(result.line, budget === "Budget" ? /smart stays/ : budget === "Luxury" ? /treat-yourself stays/ : /comfort-led stays/);
        }
      }
    }
    for (const needs of ["", "Step-free routes", "Wheelchair", "Accessibility notes"]) {
      const cues = getPackingCues({ interests: selected, needs });
      assert.ok(cues.length >= 2 && cues.length <= 6);
      assert.equal(new Set(cues).size, cues.length);
      assert.equal(cues.includes("Save accessibility notes offline"), Boolean(needs));
    }
  }
});
