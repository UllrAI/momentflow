import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSelection,
  initialSelection,
  latestExport,
  seconds,
} from "../src/api.js";
test("default selection stays within duration and clip bounds", () => {
  const s = Array.from({ length: 15 }, (_, i) => ({
    id: String(i),
    duration: 5,
  }));
  assert.deepEqual(defaultSelection(s), ["0", "1", "2", "3", "4", "5"]);
});
test("stale exports cannot replace the current delivered result", () => {
  const p = {
    exports: [
      { id: "a", person_id: "child", current: true },
      { id: "b", person_id: "child", current: false },
      { id: "c", person_id: "other", current: true },
    ],
  };
  assert.equal(latestExport(p, "child").id, "a");
  assert.equal(seconds(125), "02:05");
});

test("adopted story selection survives refresh without a rendered export", () => {
  const p = {
    people: [
      {
        id: "a",
        applied_story_id: "story",
        story: {
          id: "story",
          current: true,
          applied: true,
          selected_ids: ["second", "first"],
        },
      },
    ],
    exports: [],
  };
  const segments = [
    { id: "first", duration: 3 },
    { id: "second", duration: 4 },
  ];
  assert.deepEqual(initialSelection(p, "a", segments), ["second", "first"]);
  p.people[0].story.current = false;
  assert.deepEqual(initialSelection(p, "a", segments), ["first", "second"]);
});
