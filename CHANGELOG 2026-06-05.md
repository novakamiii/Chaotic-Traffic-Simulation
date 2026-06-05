# Changelog

## [Unreleased] — 2026-06-05

> Initial project setup — complete source tree for "The Wait" traffic intersection simulation.

### Added
- Add PHP entry point (`index.php`) with route dispatch, security headers, and input validation
- Add Three.js scene with orthographic 2.5D camera, directional lighting, and shadow mapping in `src/scene.js`
- Build intersection geometry — roads, lane markings, crosswalks, and sidewalks in `src/intersection.js`
- Create 3D traffic light model with red/yellow/green bulb glow animation and state machine in `src/trafficLight.js`
- Implement vehicle entities with random colors, lane-following movement, collision avoidance, and a patience-based red-light running system in `src/vehicle.js`
- Implement pedestrian entities with crosswalk behavior, wait animation, patience-driven jaywalking, and mid-cross hesitation in `src/pedestrian.js`
- Add traffic manager for vehicle/pedestrian spawning, absurd light timing, and accident orchestration in `src/trafficManager.js`
- Add chaos meter system that builds from density, jaywalking, and red-light runs, then triggers accidents at threshold in `src/chaosSystem.js`
- Add procedural audio system — city ambience, honk synthesis, crossing beeps, and crash boom via Web Audio API in `src/audio.js`
- Add HUD overlay with live stats, chaos meter bar, and mini traffic light indicators in `src/hud.js`
- Add Tweakpane control panel for traffic density, light speed, pedestrian chaos, and manual accident trigger
- Add CSS layout for HUD, crash flash overlay, toast message, and mini lights (`src/style.css`)
- Add Vite build configuration (`vite.config.js`) with `dist/app.js` output
- Add `start.sh` development workflow running PHP server and Vite watch in parallel via concurrently
- Add project dependencies: `three`, `gsap`, `chance`, `tweakpane`, `howler`, `simplex-noise`
