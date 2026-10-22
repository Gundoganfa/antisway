/* Anti-Sway Lab: dependency-free, deterministic crane motion / pendulum model.
 * Current is an idealized motor torque-producing Iq estimate, not measured RMS.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AntiSwayPhysics = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const G = 9.81;
  const DT = 1 / 120;
  const TROLLEY_MASS = 2500;  // kg
  const ROLLING_FRICTION = 0.012;
  const VISCOUS_FRICTION = 45; // N / (m/s)
  const DRIVE_RADIUS = 0.22;   // m
  const GEAR_RATIO = 18;
  const GEAR_EFFICIENCY = 0.91;
  const TORQUE_CONSTANT = 1.8; // Nm/A, equivalent motor Iq convention
  const DAMPING_RATIO = 0.004;

  function finitePositive(value, name) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(name + " must be a finite positive number");
    return value;
  }

  function period(rope) {
    return 2 * Math.PI * Math.sqrt(finitePositive(rope, "rope length") / G);
  }

  // Exact triangular/trapezoidal velocity trajectory for a given distance.
  function profile(distance, vmax, acceleration) {
    finitePositive(distance, "distance");
    finitePositive(vmax, "max speed");
    finitePositive(acceleration, "acceleration");
    const tAcc = Math.min(vmax / acceleration, Math.sqrt(distance / acceleration));
    const vPeak = acceleration * tAcc;
    const tCruise = Math.max(0, (distance - vPeak * tAcc) / vPeak);
    const total = 2 * tAcc + tCruise;
    return { distance, vmax, acceleration, tAcc, tCruise, vPeak, total };
  }

  function velocityAt(p, time) {
    if (time <= 0 || time >= p.total) return 0;
    if (time < p.tAcc) return p.acceleration * time;
    if (time < p.tAcc + p.tCruise) return p.vPeak;
    return Math.max(0, p.acceleration * (p.total - time));
  }

  // Zero-vibration-derivative input shaper for an undamped nominal pendulum:
  // 1/4 at t=0, 1/2 at T/2 and 1/4 at T. Shaping velocity preserves its area.
  function shapedVelocityAt(p, time, T) {
    return 0.25 * velocityAt(p, time)
      + 0.5 * velocityAt(p, time - T / 2)
      + 0.25 * velocityAt(p, time - T);
  }

  function angularAcceleration(theta, omega, cartAcceleration, length) {
    const natural = Math.sqrt(G / length);
    return -(G / length) * Math.sin(theta)
      - (cartAcceleration / length) * Math.cos(theta)
      - 2 * DAMPING_RATIO * natural * omega;
  }

  // Semi-analytic trolley velocity with RK4 integration of nonlinear pendulum.
  function advancePlant(plant, vNext, dt, cfg) {
    const acceleration = (vNext - plant.v) / dt;
    const f = (theta, omega) => angularAcceleration(theta, omega, acceleration, cfg.rope);
    const k1theta = plant.omega;
    const k1omega = f(plant.theta, plant.omega);
    const k2theta = plant.omega + dt * k1omega / 2;
    const k2omega = f(plant.theta + dt * k1theta / 2, plant.omega + dt * k1omega / 2);
    const k3theta = plant.omega + dt * k2omega / 2;
    const k3omega = f(plant.theta + dt * k2theta / 2, plant.omega + dt * k2omega / 2);
    const k4theta = plant.omega + dt * k3omega;
    const k4omega = f(plant.theta + dt * k3theta, plant.omega + dt * k3omega);

    plant.x += 0.5 * (plant.v + vNext) * dt;
    plant.v = vNext;
    plant.theta += dt * (k1theta + 2 * k2theta + 2 * k3theta + k4theta) / 6;
    plant.omega += dt * (k1omega + 2 * k2omega + 2 * k3omega + k4omega) / 6;
    plant.a = acceleration;

    // Horizontal external motor force on trolley+payload (ideal point load).
    // x_payload_ddot = x_trolley_ddot + L*(theta_ddot*cos(theta)-omega²*sin(theta))
    const thetaDDot = angularAcceleration(plant.theta, plant.omega, acceleration, cfg.rope);
    const forceInertia = (TROLLEY_MASS + cfg.payload) * acceleration
      + cfg.payload * cfg.rope * (thetaDDot * Math.cos(plant.theta) - plant.omega ** 2 * Math.sin(plant.theta));
    const rolling = Math.abs(plant.v) > 0.005
      ? (TROLLEY_MASS + cfg.payload) * G * ROLLING_FRICTION * Math.sign(plant.v) : 0;
    const force = forceInertia + rolling + VISCOUS_FRICTION * plant.v;
    plant.current = force * DRIVE_RADIUS / (GEAR_RATIO * GEAR_EFFICIENCY * TORQUE_CONSTANT);
  }

  function emptyPlant() {
    return { x: 0, v: 0, a: 0, theta: 0, omega: 0, current: 0,
      history: { t: [0], x: [0], v: [0], a: [0], theta: [0], current: [0] } };
  }

  function makeScenario(config) {
    const cfg = {
      distance: finitePositive(Number(config.distance), "distance"),
      rope: finitePositive(Number(config.rope), "rope"),
      payload: finitePositive(Number(config.payload), "payload"),
      speed: finitePositive(Number(config.speed), "speed"),
      accel: finitePositive(Number(config.accel), "accel")
    };
    const p = profile(cfg.distance, cfg.speed, cfg.accel);
    const T = period(cfg.rope);
    return {
      cfg, p, T, t: 0, done: false,
      standardStop: p.total, shapedStop: p.total + T,
      end: p.total + 3 * T,
      standard: emptyPlant(), shaped: emptyPlant()
    };
  }

  function record(plant, t) {
    const h = plant.history;
    h.t.push(t); h.x.push(plant.x); h.v.push(plant.v); h.a.push(plant.a);
    h.theta.push(plant.theta); h.current.push(plant.current);
  }

  function step(scenario) {
    if (scenario.done) return scenario;
    const next = Math.min(scenario.end, scenario.t + DT);
    const dt = next - scenario.t;
    if (dt <= 1e-12) { scenario.done = true; return scenario; }
    const standardV = velocityAt(scenario.p, next);
    const shapedV = shapedVelocityAt(scenario.p, next, scenario.T);
    advancePlant(scenario.standard, standardV, dt, scenario.cfg);
    advancePlant(scenario.shaped, shapedV, dt, scenario.cfg);
    scenario.t = next;
    record(scenario.standard, next);
    record(scenario.shaped, next);
    if (next >= scenario.end - 1e-9) scenario.done = true;
    return scenario;
  }

  function advance(scenario, count) {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 1;
    for (let i = 0; i < n && !scenario.done; i++) step(scenario);
    return scenario;
  }

  function residualRms(plant, stop, T) {
    const h = plant.history;
    let sum = 0, count = 0;
    for (let i = 0; i < h.t.length; i++) {
      if (h.t[i] >= stop && h.t[i] < stop + T) {
        sum += h.theta[i] ** 2;
        count++;
      }
    }
    return count >= 2 ? Math.sqrt(sum / count) * 180 / Math.PI : null;
  }

  function results(scenario) {
    if (!scenario.done) return null;
    const standard = residualRms(scenario.standard, scenario.standardStop, scenario.T);
    const shaped = residualRms(scenario.shaped, scenario.shapedStop, scenario.T);
    const reduction = standard > 1e-9 ? 100 * (1 - shaped / standard) : null;
    return { standardRms: standard, shapedRms: shaped, reduction,
      standardStop: scenario.standardStop, shapedStop: scenario.shapedStop,
      standardPosition: scenario.standard.x, shapedPosition: scenario.shaped.x };
  }

  function runToEnd(config) {
    const s = makeScenario(config);
    while (!s.done) step(s);
    return s;
  }

  return { G, DT, period, profile, velocityAt, shapedVelocityAt, makeScenario,
    angularAcceleration, step, advance, residualRms, results, runToEnd };
});