import test from "node:test";
import assert from "node:assert/strict";
import { defaultSelection, latestExport, seconds } from "../src/api.js";
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
