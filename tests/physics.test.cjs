"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../physics.js");

const defaults = { distance: 18, rope: 8, payload: 4000, speed: 2, accel: 0.75 };

test("natural swing period uses the simple pendulum formula", () => {
  assert.ok(Math.abs(P.period(8) - 2 * Math.PI * Math.sqrt(8 / 9.81)) < 1e-12);
  assert.throws(() => P.period(0), RangeError);
});

test("trapezoidal and triangular motion profiles respect distance and velocity", () => {
  for (const [distance, v, acc] of [[18, 2, .75], [2, 3, 1.5], [30, 3, 1.5]]) {
    const p = P.profile(distance, v, acc);
    assert.ok(p.vPeak <= v + 1e-12);
    assert.ok(Math.abs(p.vPeak * (p.tAcc + p.tCruise) - distance) < 1e-10);
    for (let t = -1; t <= p.total + 1; t += .03) {
      assert.ok(P.velocityAt(p, t) >= 0);
      assert.ok(P.velocityAt(p, t) <= v + 1e-10);
    }
  }
});

test("ZVD shaping preserves profile area and adds exactly one swing period", () => {
  const p = P.profile(defaults.distance, defaults.speed, defaults.accel);
  const T = P.period(defaults.rope);
  const dt = .001;
  let area = 0;
  for (let t = dt / 2; t < p.total + T; t += dt) {
    const v = P.shapedVelocityAt(p, t, T);
    assert.ok(v >= -1e-12 && v <= defaults.speed + 1e-12);
    area += v * dt;
  }
  assert.ok(Math.abs(area - defaults.distance) < 1e-4);
  assert.equal(P.shapedVelocityAt(p, p.total + T + 1, T), 0);
});

test("both cranes complete the same commanded move without NaN samples", () => {
  const s = P.runToEnd(defaults);
  const r = P.results(s);
  assert.ok(s.done);
  assert.ok(Math.abs(r.standardPosition - defaults.distance) < .002);
  assert.ok(Math.abs(r.shapedPosition - defaults.distance) < .002);
  assert.ok(Math.abs(r.shapedStop - r.standardStop - s.T) < 1e-9);
  assert.equal(s.standard.history.t.length, s.shaped.history.t.length);
  for (const plant of [s.standard, s.shaped]) {
    for (const column of Object.values(plant.history)) {
      assert.equal(column.length, plant.history.t.length);
      assert.ok(column.every(Number.isFinite));
    }
  }
});

test("shaper strongly reduces residual sway on representative operating points", () => {
  for (const c of [
    defaults,
    { distance: 8, rope: 3, payload: 8000, speed: 3, accel: 1.5 },
    { distance: 30, rope: 15, payload: 1000, speed: 3, accel: 1.5 }
  ]) {
    const r = P.results(P.runToEnd(c));
    assert.ok(r.standardRms > .1);
    assert.ok(r.shapedRms < r.standardRms * .2,
      "Shaped RMS must be below 20% of reference at " + JSON.stringify(c));
  }
});

test("current is a finite signed traction estimate; crane can regenerate when braking", () => {
  const s = P.runToEnd(defaults);
  const a = s.standard.history.current;
  assert.ok(a.some((v) => v > 1));
  assert.ok(a.some((v) => v < -1));
  assert.ok(Math.max(...a.map(Math.abs)) < 500);
});

test("invalid physical inputs are rejected", () => {
  assert.throws(() => P.makeScenario({ ...defaults, rope: -1 }), RangeError);
  assert.throws(() => P.makeScenario({ ...defaults, payload: 0 }), RangeError);
  assert.throws(() => P.profile(18, NaN, .5), RangeError);
});
