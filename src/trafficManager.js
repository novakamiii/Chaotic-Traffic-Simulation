import * as THREE from 'three';
import gsap from 'gsap';
import { TrafficLight } from './trafficLight.js';
import { Vehicle } from './vehicle.js';
import { Pedestrian } from './pedestrian.js';
import { LANES, SPAWN_POINTS } from './intersection.js';
import { honk, startBeeping, stopBeeping, playWilhelmScream } from './audio.js';
import Chance from 'chance';

const chance = new Chance();

export class TrafficManager {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = [];
    this.pedestrians = [];
    this.lights = {};
    this.lightTimers = {};
    this.spawnTimers = { ns: 0, ew: 0, ped: 0 };
    this.trafficDensity = 0.5; // 0-1
    this.lightSpeed = 1;
    this.pedestrianChaos = 0.5;
    this.accidentCooldown = 0;
    this.totalCarsSpawned = 0;
    this.totalPedestrians = 0;
    this.jaywalkers = 0;
    this.hitPedestrians = 0;
    this.accidents = 0;
    this.ranReds = 0;
    this.onAccident = null;
    this.chaosSystem = null;

    this.buildLights();
  }

  buildLights() {
    this.lights.ns = new TrafficLight(this.scene, { x: -4.5, z: -4.5 });
    this.lights.ew = new TrafficLight(this.scene, { x: 4.5, z: 4.5 });

    // Start with NS red, EW green
    this.lights.ns.setState('red');
    this.lights.ew.setState('green');
    this.lightTimers.ns = 0;
    this.lightTimers.ew = this.lights.ew.getStateDuration() / this.lightSpeed;
  }

  update(delta) {
    // Update accident cooldown
    this.accidentCooldown = Math.max(0, this.accidentCooldown - delta);

    // Update lights
    this.updateLights(delta);

    // Spawn
    this.spawnTimer(delta);

    // Update vehicles
    const events = [];
    this.vehicles.forEach((v) => {
      if (!v.alive) return;
      const lightState = this.getLightStateForLane(v);
      const nearby = this.getVehiclesAhead(v);
      const oncoming = this.getOncomingTraffic(v);
      const result = v.update(delta, null, lightState, nearby, oncoming);
      if (result.ranRed) {
        this.ranReds++;
        if (this.chaosSystem) this.chaosSystem.addEvent('ranRed');
        events.push('ranRed');
      }
      if (result.honk) events.push('honk');
      if (result.offscreen) events.push('offscreen');
    });

    // Bump detection — check all vehicle pairs for proximity collisions
    const now = performance.now();
    for (let i = 0; i < this.vehicles.length; i++) {
      const a = this.vehicles[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const b = this.vehicles[j];
        if (!b.alive) continue;
        // Skip stopped-stopped pairs — that's just queued traffic
        if (a.stopped && b.stopped) continue;
        const dist = a.group.position.distanceTo(b.group.position);
        if (dist < 2.5 && now - a.lastHitTime > 800 && now - b.lastHitTime > 800) {
          a.takeDamage(1, this.scene);
          b.takeDamage(1, this.scene);
          if (this.chaosSystem) {
            this.chaosSystem.addEvent('nearMiss');
            this.chaosSystem.level += 0.01;
          }
        }
      }
    }

    // Remove dead vehicles
    this.vehicles = this.vehicles.filter((v) => v.alive);

    // Process honks
    events.forEach((e) => {
      if (e === 'honk') honk();
    });

    // Update pedestrians
    const isWalkGreen = this.lights.ns.isRed(); // walk signal = cars on NS are stopped
    this.pedestrians.forEach((p) => {
      const result = p.update(delta, isWalkGreen, this.vehicles);
      if (result.jaywalking) this.jaywalkers++;
    });

    // Vehicle-pedestrian collisions — cars can run over pedestrians on the crosswalk
    this.vehicles.forEach((v) => {
      if (!v.alive) return;
      this.pedestrians.forEach((p) => {
        if (!p.alive || p.phase !== 'crossing') return;
        const dist = v.group.position.distanceTo(p.group.position);
        if (dist < 1.5) {
          // Pedestrian hit! Remove with a quick scatter effect
          this.hitPedestrians++;
          if (this.chaosSystem) {
            this.chaosSystem.addEvent('nearMiss');
            this.chaosSystem.level += 0.03;
          }
          // Gore at impact point
          this.spawnGore(v.group.position.clone(), this.scene);
          // Wilhelm scream with gender-based pitch
          playWilhelmScream(p.gender === 'female');
          // Toss the pedestrian and remove
          const pPos = p.group.position;
          p.alive = false;
          gsap.to(pPos, {
            y: 1.5,
            duration: 0.3,
            ease: 'power2.out',
          });
          gsap.to(p.group.scale, {
            x: 0, y: 0, z: 0,
            duration: 0.4,
            delay: 0.1,
            onComplete: () => p.dispose(),
          });
        }
      });
    });

    // Remove finished pedestrians
    this.pedestrians = this.pedestrians.filter((p) => p.alive);

    // Beep control
    if (isWalkGreen) {
      startBeeping();
    } else {
      stopBeeping();
    }
  }

  updateLights(delta) {
    ['ns', 'ew'].forEach((id) => {
      this.lightTimers[id] = (this.lightTimers[id] ?? 0) + delta * this.lightSpeed;

      const light = this.lights[id];
      const duration = light.getStateDuration();

      if (this.lightTimers[id] >= duration) {
        this.lightTimers[id] = 0;
        const next = light.getNextState();
        light.setState(next);

        // If NS gets green, EW gets red and vice versa
        if (id === 'ns') {
          if (next === 'green') {
            this.lights.ew.setState('red');
            this.lightTimers.ew = 0;
          } else if (next === 'red') {
            this.lights.ew.setState('green');
            this.lightTimers.ew = 0;
          }
        }
      }
    });
  }

  getLightStateForLane(vehicle) {
    // Use vehicle's mutable dir — handles turned cars correctly
    if (vehicle.dir === 'north' || vehicle.dir === 'south') {
      return this.lights.ns.state;
    }
    return this.lights.ew.state;
  }

  getVehiclesAhead(vehicle) {
    const pos = vehicle.group.position;
    const dir = vehicle.dir;

    return this.vehicles.filter((other) => {
      if (other === vehicle || !other.alive) return false;
      if (other.dir !== dir) return false;

      // Same lane check (lateral proximity)
      const otherPos = other.group.position;
      const lateralDist =
        dir === 'north' || dir === 'south'
          ? Math.abs(pos.x - otherPos.x)
          : Math.abs(pos.z - otherPos.z);
      if (lateralDist > 2) return false;

      // Is the other car ahead of this one?
      let isAhead;
      switch (dir) {
        case 'north': isAhead = otherPos.z < pos.z; break;
        case 'south': isAhead = otherPos.z > pos.z; break;
        case 'east':  isAhead = otherPos.x > pos.x; break;
        case 'west':  isAhead = otherPos.x < pos.x; break;
      }

      return isAhead && pos.distanceTo(otherPos) < 20;
    });
  }

  getOncomingTraffic(vehicle) {
    const oppositeDirs = { north: 'south', south: 'north', east: 'west', west: 'east' };
    const oppDir = oppositeDirs[vehicle.dir];
    const range = 12;

    return this.vehicles.filter((other) => {
      if (other === vehicle || !other.alive) return false;
      if (other.dir !== oppDir) return false;

      const oPos = other.group.position;
      // Already in the intersection
      if (Math.abs(oPos.x) < 5 && Math.abs(oPos.z) < 5) return true;

      // Approaching the intersection from the far side
      switch (vehicle.dir) {
        case 'north':
          // Southbound approaching from below (z < -4.5)
          return oPos.z < -4.5 && oPos.z > -4.5 - range;
        case 'south':
          // Northbound approaching from above (z > 4.5)
          return oPos.z > 4.5 && oPos.z < 4.5 + range;
        case 'east':
          // Westbound approaching from right (x > 4.5)
          return oPos.x > 4.5 && oPos.x < 4.5 + range;
        case 'west':
          // Eastbound approaching from left (x < -4.5)
          return oPos.x < -4.5 && oPos.x > -4.5 - range;
      }
      return false;
    });
  }

  spawnTimer(delta) {
    // Spawn cars
    this.spawnTimers.ns -= delta;
    this.spawnTimers.ew -= delta;

    const nsInterval = Math.max(0.3, 2.5 - this.trafficDensity * 2);
    const ewInterval = Math.max(0.3, 2.5 - this.trafficDensity * 2);

    if (this.spawnTimers.ns <= 0) {
      this.spawnCar(chance.pickone(['north', 'south']));
      this.spawnTimers.ns = nsInterval * (0.5 + Math.random());
    }
    if (this.spawnTimers.ew <= 0) {
      this.spawnCar(chance.pickone(['east', 'west']));
      this.spawnTimers.ew = ewInterval * (0.5 + Math.random());
    }

    // Spawn pedestrians
    this.spawnTimers.ped = (this.spawnTimers.ped ?? 0) - delta;
    const pedInterval = Math.max(1.5, 6 - this.pedestrianChaos * 4);
    if (this.spawnTimers.ped <= 0) {
      this.spawnPedestrian();
      this.spawnTimers.ped = pedInterval * (0.5 + Math.random());
    }
  }

  spawnCar(direction) {
    const laneKey = direction === 'north' ? 'nsNorth'
      : direction === 'south' ? 'nsSouth'
      : direction === 'east' ? 'ewEast'
      : 'ewWest';
    const lane = LANES[laneKey];
    if (!lane) return;

    const spawn = SPAWN_POINTS[direction];
    const spawnCoord = direction === 'north' || direction === 'south'
      ? spawn.z : spawn.x;

    const v = new Vehicle(this.scene, lane, spawnCoord);
    this.vehicles.push(v);
    this.totalCarsSpawned++;
  }

  spawnPedestrian() {
    // Pick a crosswalk side and a travel direction
    const side = chance.pickone(['north', 'south']);
    const direction = chance.pickone(['east', 'west']);
    const z = side === 'north' ? -5.5 : 5.5;
    const dist = 15 + Math.random() * 10; // 15-25 units from intersection

    let approachX, cornerX, targetX, exitX;
    if (direction === 'east') {
      approachX = -dist;
      cornerX = -5.5;
      targetX = 5.5;
      exitX = dist;
    } else {
      approachX = dist;
      cornerX = 5.5;
      targetX = -5.5;
      exitX = -dist;
    }

    const targetZ = side === 'north' ? 5.5 : -5.5;
    const p = new Pedestrian(this.scene, approachX, cornerX, z, targetX, targetZ, exitX);
    this.pedestrians.push(p);
    this.totalPedestrians++;
  }

  triggerAccident() {
    if (this.accidentCooldown > 0 || this.vehicles.length < 2) return false;

    this.accidentCooldown = 5;

    // Find two vehicles — include stopped ones so queueing traffic can collide
    const alive = this.vehicles.filter((v) => v.alive);
    if (alive.length < 2) return false;

    // Pick the first car that's near the intersection (more dramatic)
    let v1 = alive.find((v) => Math.abs(v.group.position.x) < 10 && Math.abs(v.group.position.z) < 10);
    if (!v1) v1 = chance.pickone(alive);

    // Pick a second car — prefer one in the opposite lane (head-on)
    const oppositeDirs = { north: 'south', south: 'north', east: 'west', west: 'east' };
    let v2 = alive.find((v) => v !== v1 && v.alive && v.lane.dir === oppositeDirs[v1.lane.dir]);

    // Fallback: any other car
    if (!v2) {
      v2 = alive.find((v) => v !== v1 && v.alive);
    }
    if (!v2) return false;

    // Teleport v2 next to v1 and explode both immediately
    const crashPos = v1.group.position.clone();
    v2.group.position.set(
      crashPos.x + (Math.random() - 0.5) * 1.5,
      0,
      crashPos.z + (Math.random() - 0.5) * 1.5
    );

    v1.explode(this.scene);
    v2.explode(this.scene);

    this.vehicles = this.vehicles.filter((v) => v !== v1 && v !== v2);
    this.accidents++;

    // Sprinkle debris particles at the crash site
    this.spawnDebris(crashPos);

    // Scatter nearby pedestrians (any phase)
    this.pedestrians.forEach((p) => {
      if (!p.alive || p.finished) return;
      const pp = p.group.position;
      if (pp.distanceTo(crashPos) < 8) {
        p.speed *= 3;
      }
    });

    if (this.onAccident) this.onAccident(crashPos);

    return true;
  }

  spawnDebris(center) {
    const count = 30;
    const colors = [0xff6b35, 0xff4444, 0x888888, 0xffaa00];
    for (let i = 0; i < count; i++) {
      const size = 0.05 + Math.random() * 0.15;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        emissive: 0xff4400,
        emissiveIntensity: 0.2,
      });
      const debris = new THREE.Mesh(geo, mat);
      const theta = Math.random() * Math.PI * 2;
      const dist = 0.5 + Math.random() * 2;
      debris.position.set(
        center.x + Math.cos(theta) * dist,
        0.5 + Math.random() * 1.5,
        center.z + Math.sin(theta) * dist
      );
      debris.castShadow = true;
      this.scene.add(debris);

      // Animate debris bouncing
      const targetY = 0.05;
      const duration = 0.8 + Math.random() * 0.6;

      gsap.to(debris.position, {
        y: targetY,
        duration,
        ease: 'bounce.out',
      });
      gsap.to(debris.rotation, {
        x: Math.random() * 6,
        z: Math.random() * 6,
        duration,
        ease: 'power2.out',
      });
      gsap.to(debris.material, {
        opacity: 0,
        duration: 0.5,
        delay: 3,
        onComplete: () => {
          this.scene.remove(debris);
          geo.dispose();
          mat.dispose();
        },
      });
    }
  }

  setDensity(val) {
    this.trafficDensity = val;
  }

  setLightSpeed(val) {
    this.lightSpeed = val;
  }

  setPedestrianChaos(val) {
    this.pedestrianChaos = val;
  }

  getStats() {
    return {
      vehicles: this.vehicles.length,
      pedestrians: this.pedestrians.length,
      totalCarsSpawned: this.totalCarsSpawned,
      totalPedestrians: this.totalPedestrians,
      accidents: this.accidents,
      ranReds: this.ranReds,
      jaywalkers: this.jaywalkers,
      hitPedestrians: this.hitPedestrians,
    };
  }

  spawnGore(position, scene) {
    // ── Blood splatter on the ground ──────────────────────────────
    const splashCanvas = document.createElement('canvas');
    const s = 128;
    splashCanvas.width = s;
    splashCanvas.height = s;
    const ctx = splashCanvas.getContext('2d');

    // Translucent dark red background circle
    const gradient = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, 'rgba(160, 0, 0, 0.9)');
    gradient.addColorStop(0.3, 'rgba(120, 0, 0, 0.7)');
    gradient.addColorStop(0.6, 'rgba(80, 0, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(40, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    ctx.fill();

    // Random splatter streaks
    ctx.strokeStyle = 'rgba(180, 20, 20, 0.6)';
    ctx.lineWidth = 2 + Math.random() * 3;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const len = 10 + Math.random() * 30;
      ctx.beginPath();
      ctx.moveTo(s / 2, s / 2);
      ctx.lineTo(
        s / 2 + Math.cos(angle) * len,
        s / 2 + Math.sin(angle) * len,
      );
      ctx.stroke();
    }

    // Small dot splatter
    ctx.fillStyle = 'rgba(180, 20, 20, 0.5)';
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      const r = 2 + Math.random() * 5;
      ctx.beginPath();
      ctx.arc(
        s / 2 + Math.cos(angle) * dist,
        s / 2 + Math.sin(angle) * dist,
        r, 0, Math.PI * 2,
      );
      ctx.fill();
    }

    const splashTex = new THREE.CanvasTexture(splashCanvas);
    const splashMat = new THREE.SpriteMaterial({
      map: splashTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const splash = new THREE.Sprite(splashMat);
    splash.position.set(position.x, 0.02, position.z);
    splash.scale.set(2.5 + Math.random(), 2.5 + Math.random(), 1);
    scene.add(splash);

    // Fade out over 8 seconds
    gsap.to(splashMat, {
      opacity: 0,
      duration: 8,
      delay: 0.5,
      ease: 'power1.out',
      onComplete: () => {
        scene.remove(splash);
        splashMat.dispose();
        splashTex.dispose();
      },
    });

    // ── Blood spray particles ─────────────────────────────────────
    const pCount = 20;
    const pPositions = new Float32Array(pCount * 3);
    const pColors = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 0.3 + Math.random() * 1.5;
      pPositions[i * 3] = position.x + r * Math.sin(theta) * Math.cos(phi);
      pPositions[i * 3 + 1] = position.y + 0.3 + Math.random() * 0.5;
      pPositions[i * 3 + 2] = position.z + r * Math.sin(theta) * Math.sin(phi);

      const dark = 0.1 + Math.random() * 0.3;
      pColors[i * 3] = 0.5 + Math.random() * 0.3;
      pColors[i * 3 + 1] = dark;
      pColors[i * 3 + 2] = dark;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Animate spray outward
    const targets = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.5 + Math.random() * 3;
      targets[i * 3] = position.x + Math.cos(angle) * dist;
      targets[i * 3 + 1] = position.y + Math.random() * 1.5;
      targets[i * 3 + 2] = position.z + Math.sin(angle) * dist;
    }

    const startPos = [...pPositions];

    gsap.to({ t: 0 }, {
      t: 1,
      duration: 0.6 + Math.random() * 0.3,
      ease: 'power2.out',
      onUpdate: function () {
        const t = this.targets()[0].t;
        const arr = particles.geometry.attributes.position.array;
        for (let i = 0; i < pCount; i++) {
          arr[i * 3] = startPos[i * 3] + (targets[i * 3] - startPos[i * 3]) * t;
          arr[i * 3 + 1] = startPos[i * 3 + 1] + (targets[i * 3 + 1] - startPos[i * 3 + 1]) * t
            + Math.sin(t * Math.PI) * 1.5;
          arr[i * 3 + 2] = startPos[i * 3 + 2] + (targets[i * 3 + 2] - startPos[i * 3 + 2]) * t;
        }
        particles.geometry.attributes.position.needsUpdate = true;
      },
      onComplete: () => {
        gsap.to(particles.material, {
          opacity: 0,
          duration: 1.5,
          ease: 'power1.out',
          onComplete: () => {
            scene.remove(particles);
            particles.geometry.dispose();
            particles.material.dispose();
          },
        });
      },
    });
  }

  dispose() {
    Object.values(this.lights).forEach((l) => l.dispose());
    this.vehicles.forEach((v) => v.dispose());
    this.pedestrians.forEach((p) => p.dispose());
    this.vehicles = [];
    this.pedestrians = [];
  }
}
