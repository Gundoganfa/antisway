# Anti-Sway Lab

An interactive, side-by-side **overhead crane / bridge trolley anti-sway simulator**, built with HTML, CSS and vanilla JavaScript. No build tools, server APIs or third-party runtime dependencies.

The two cranes are given **exactly the same travel distance, rope length, payload, maximum velocity, acceleration limit and trolley/payload plant model**:

| Crane A | Crane B |
|---|---|
| Unshaped trapezoidal (or short-move triangular) velocity profile | 3-impulse **ZVD input-shaped** version of the same velocity profile |
| Nominal arrival at `t = t_base` | Nominal arrival at `t = t_base + T` |
| Residual load sway depends on excitation timing | Strong residual sway attenuation when rope length and model match |

## Features

- Two continuously animated gantry cranes, running on a shared simulation clock.
- Live oscilloscope traces of **velocity (m/s)**, **estimated signed motor torque-producing current (A)**, and **suspended load angle (degrees)**.
- Adjustable travel, rope length, payload mass, max speed and acceleration.
- Play, pause, reset, 1×/2×/4× playback.
- Every 1/120-second sample is held **locally in browser memory** while the page is open, then exported at any point as a combined CSV file.
- Final residual sway comparison: angle RMS over **one natural pendulum period after each individual trolley stops**.
- Tests for position tracking, ZVD tuning, sample finiteness and representative sway reduction.

## Run

Open `index.html` in a modern browser, or run a static server:

```sh
python3 -m http.server 8000
# visit http://localhost:8000
```

For unit tests (Node.js 20+):

```sh
npm test
```

### Publish with GitHub Pages

In this repository's **Settings → Pages**, set **Build and deployment → Source** to **Deploy from a branch**, select **main**, and choose **/(root)**. After GitHub reports a successful publish, the expected address will be:

https://gundoganfa.github.io/antisway/

> The repository contents alone do not activate GitHub Pages. That setting must be enabled separately.

## Control concept

The rope-and-load natural period used for feedforward shaping is

```text
T = 2 pi sqrt(L/g)
```

where `L` is rope length in meters and `g=9.81 m/s²`. The unshaped base velocity `v_base(t)` is a trapezoid/triangle with travel distance `D`. The ZVD-filtered velocity is:

```text
v_ZVD(t) = 0.25 v_base(t) + 0.50 v_base(t - T/2) + 0.25 v_base(t - T)
```

This is an *input shaper / model-based feedforward command*. It does **not** use load angle measurement or closed-loop feedback. For the nominal undamped small-angle pendulum, its three impulses cancel the natural vibration with first-order insensitivity to frequency error. The weighted sum preserves total travel distance and nominal speed bounds; it adds `T` to nominal movement time. The UI makes that time-versus-sway trade-off visible.

### Plant dynamics

A fixed-length **nonlinear pendulum** is integrated at a deterministic 120 Hz with RK4:

```text
theta_ddot = -(g/L) sin(theta) - (x_ddot/L) cos(theta) - 2*zeta*sqrt(g/L)*theta_dot
```

with light damping `zeta=0.004`. The trolley has perfect imposed velocity tracking; acceleration is the finite-difference derivative of its command. The plant **does not** simulate the drive's speed loop, torque limits, saturation, elasticity, hoist motion, disturbances or measurement noise.

### Current trace — illustrative, not measured

The current channel is an **equivalent signed torque-producing Iq estimate** (positive for driving, negative for regenerative torque) inferred from longitudinal traction force, not an inverter-measured motor phase/RMS current:

```text
x_load_ddot = x_ddot + L*(theta_ddot*cos(theta) - theta_dot²*sin(theta))
F = M_trolley*x_ddot + M_payload*x_load_ddot
    + rolling_friction + viscous_friction
Iq_est = F * wheel_radius / (gear_ratio * gearbox_efficiency * motor_Kt)
```

Fixed illustrative assumptions: trolley `2500 kg`, rolling coefficient `0.012`, viscous loss `45 N/(m/s)`, wheel radius `0.22 m`, gear ratio `18:1`, gearbox efficiency `0.91`, and motor torque constant `1.8 Nm/A`. For negative torque the same idealized efficiency is used. These assumptions are intentionally disclosed rather than presented as calibrated field data.

## Engineering limitations

This is an **educational simulation**, not a crane commissioning tool or functional-safety design. Actual crane systems may have variable rope length, hoist/trolley coupling, rope elasticity, distributed payloads, friction and gearbox nonlinearities, speed-loop limitations, sway sensor noise, and load/rope collision envelopes. These require a more complete model and commissioning/validation.

The dramatic nominal ZVD residual improvement shown by the default configuration is *not* a guarantee of field performance. ZVD can be degraded by rope-length mismatch, motion constraints and other oscillatory modes.

## Files

- `index.html` — dashboard structure and accessible controls
- `style.css` — responsive industrial interface
- `physics.js` — deterministic crane math and pure simulation API
- `app.js` — animation, canvas scopes, UI, local trace capture and CSV
- `tests/physics.test.cjs` — Node built-in tests

## License

No license has been selected for this repository. Refer to GitHub's default copyright rules until the repository owner adds one.
