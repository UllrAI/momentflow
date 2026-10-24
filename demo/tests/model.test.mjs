import test from "node:test";
import assert from "node:assert/strict";
import {
  initialSessions,
  updateSession,
  canApprove,
  canDeliver,
  canView,
  importedSession,
  statusOf,
} from "../src/model.js";
test("unverified party cannot approve, deliver, view, or buy", () => {
  const s = initialSessions()[0];
  assert.equal(canApprove(s), false);
  for (const type of ["approve", "deliver", "purchase"])
    assert.deepEqual(updateSession(s, { type }), s);
  assert.equal(canView(s), false);
});
test("verified current render can be approved, delivered, purchased", () => {
  let s = initialSessions()[0];
  s = updateSession(s, { type: "verify" });
  assert.equal(canDeliver(s), false);
  s = updateSession(s, { type: "approve" });
  assert.equal(canDeliver(s), true);
  assert.equal(canView(s), false);
  s = updateSession(s, { type: "deliver" });
  assert.equal(canView(s), true);
  assert.equal(s.paid, false);
  s = updateSession(s, { type: "purchase" });
  assert.equal(s.paid, true);
});
test("editing invalidates render and approval; stale renders cannot approve new version", () => {
  let s = initialSessions()[1];
  s = updateSession(s, { type: "edit", clips: s.clips.slice(1) });
  assert.equal(statusOf(s), "rendering");
  assert.equal(canDeliver(s), false);
  assert.equal(canApprove(s), false);
  s = updateSession(s, { type: "render", version: 1, video: "stale" });
  assert.notEqual(s.video, "stale");
  s = updateSession(s, { type: "render", version: 2, video: "current" });
  assert.equal(canApprove(s), true);
  assert.equal(canDeliver(s), false);
});
test("newly imported media has no assumed identity, render or entitlement", () => {
  const s = importedSession("new", "林间滑索", [{ id: "clip" }]);
  assert.equal(s.verified, false);
  assert.equal(s.paid, false);
  assert.equal(canView(s), false);
  assert.equal(canDeliver(s), false);
});

test("delivered content stays immutable, preserving purchased entitlement", () => {
  let s = initialSessions()[1];
  s = updateSession(s, { type: "deliver" });
  s = updateSession(s, { type: "purchase" });
  for (const action of [
    { type: "edit", clips: [] },
    { type: "render", version: s.version, video: "replacement" },
  ]) {
    assert.deepEqual(updateSession(s, action), s);
  }
  assert.equal(s.paid, true);
});
