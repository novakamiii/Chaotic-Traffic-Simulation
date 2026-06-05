import * as THREE from 'three';
import gsap from 'gsap';
import { Pane } from 'tweakpane';

import { initScene, getScene, getCamera, getRenderer } from './scene.js';
import { buildIntersection, LIGHT_POSITIONS } from './intersection.js';
import { TrafficManager } from './trafficManager.js';
import { ChaosSystem } from './chaosSystem.js';
import { HUD } from './hud.js';
import { startAmbience, crash as crashSound } from './audio.js';

// ─── Bootstrap ───────────────────────────────────────────────────────

const container = document.getElementById('app');
if (!container) {
  document.body.innerHTML = '<div id="app"></div>';
}

const { scene, camera, renderer } = initScene(
  document.getElementById('app')
);

// ─── Build world ─────────────────────────────────────────────────────

buildIntersection(scene);

// ─── Systems ─────────────────────────────────────────────────────────

const trafficManager = new TrafficManager(scene);
const chaosSystem = new ChaosSystem();
const hud = new HUD();

// Wire chaos system into traffic manager for event feeding
trafficManager.chaosSystem = chaosSystem;

// Wire up accident callback
trafficManager.onAccident = (pos) => {
  hud.showCrashMessage(pos);
  crashSound();

  // Camera shake
  const origPos = camera.position.clone();
  gsap.to(camera.position, {
    x: origPos.x + (Math.random() - 0.5) * 2,
    y: origPos.y + (Math.random() - 0.5) * 1,
    z: origPos.z + (Math.random() - 0.5) * 2,
    duration: 0.08,
    yoyo: true,
    repeat: 5,
    ease: 'power2.inOut',
    onComplete: () => {
      camera.position.copy(origPos);
      camera.lookAt(0, 0, 0);
    },
  });

  // Flash overlay
  const app = document.getElementById('app');
  if (app) {
    app.classList.remove('flash');
    void app.offsetWidth; // reflow
    app.classList.add('flash');
  }
};

chaosSystem.onAccidentTrigger = () => {
  // Already handled via trafficManager.onAccident
};

// ─── Tweakpane Controls ──────────────────────────────────────────────

const pane = new Pane({ title: '☰ The Wait — Controls' });

const densityParams = { value: 0.5 };
const speedParams = { value: 1.0 };
const chaosParams = { value: 0.5 };

pane.addBinding(densityParams, 'value', {
  label: 'Traffic Density',
  min: 0, max: 1, step: 0.05,
}).on('change', (e) => {
  trafficManager.setDensity(e.value);
});

pane.addBinding(speedParams, 'value', {
  label: 'Light Speed',
  min: 0.1, max: 3, step: 0.1,
}).on('change', (e) => {
  trafficManager.setLightSpeed(e.value);
});

pane.addBinding(chaosParams, 'value', {
  label: 'Pedestrian Chaos',
  min: 0, max: 1, step: 0.05,
}).on('change', (e) => {
  trafficManager.setPedestrianChaos(e.value);
});

pane.addButton({
  title: 'Trigger Accident!',
}).on('click', () => {
  trafficManager.triggerAccident();
});

// ─── Start audio ─────────────────────────────────────────────────────

startAmbience();

// ─── Game Loop ───────────────────────────────────────────────────────

let lastTime = 0;
let elapsed = 0;

function animate(time) {
  requestAnimationFrame(animate);

  const delta = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  elapsed += delta;

  // Update systems
  trafficManager.update(delta);
  const stats = trafficManager.getStats();

  const chaosLevel = chaosSystem.update(delta, stats, trafficManager);

  // Build light states for HUD
  const lightStates = {
    ns: trafficManager.lights.ns?.state ?? 'red',
    ew: trafficManager.lights.ew?.state ?? 'red',
  };

  // Update HUD
  hud.update(stats, chaosSystem.getLevel(), elapsed, lightStates);

  // Rotate camera slowly around the intersection (subtle)
  // Uncomment for dramatic effect:
  // const angle = time * 0.00005;
  // camera.position.x = 22 * Math.sin(angle);
  // camera.position.z = 22 * Math.cos(angle);
  // camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}

animate(0);
