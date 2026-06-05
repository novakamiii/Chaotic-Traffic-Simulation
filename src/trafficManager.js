import * as THREE from 'three';
import gsap from 'gsap';
import { TrafficLight } from './trafficLight.js';
import { Vehicle } from './vehicle.js';
import { Pedestrian } from './pedestrian.js';
import { LANES, SPAWN_POINTS } from './intersection.js';
import { honk, startBeeping, stopBeeping } from './audio.js';
import Chance from 'chance';

const chance = new Chance();

const PEDESTRIAN_SPAWN_POINTS = [
  { x: -5.5, z: -5.5 },
  { x: 5.5, z: -5.5 },
  { x: -5.5, z: 5.5 },
  { x: 5.5, z: 5.5 },
];

const PEDESTRIAN_TARGETS = {
  '-5.5,-5.5': { x: 0, z: -4.5 },
  '5.5,-5.5': { x: 0, z: -4.5 },
  '-5.5,5.5': { x: 0, z: 4.5 },
  '5.5,5.5': { x: 0, z: 4.5 },
};

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
      const lightState = this.getLightStateForLane(v.lane);
      const nearby = this.getVehiclesAhead(v);
      const result = v.update(delta, null, lightState, nearby);
      if (result.ranRed) {
        this.ranReds++;
        if (this.chaosSystem) this.chaosSystem.addEvent('ranRed');
        events.push('ranRed');
      }
      if (result.honk) events.push('honk');
      if (result.offscreen) events.push('offscreen');
    });

    // Remove dead vehicles
    this.vehicles = this.vehicles.filter((v) => v.alive);

    // Process honks
    events.forEach((e) => {
      if (e === 'honk') honk();
    });

    // Update pedestrians
    const isWalkGreen = this.lights.ns.isRed(); // walk signal = cars on NS are stopped
    this.pedestrians.forEach((p) => {
      const result = p.update(delta, isWalkGreen);
      if (result.jaywalking) this.jaywalkers++;
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

  getLightStateForLane(lane) {
    // NS lanes check NS light, EW lanes check EW light
    if (lane.dir === 'north' || lane.dir === 'south') {
      return this.lights.ns.state;
    }
    return this.lights.ew.state;
  }

  getVehiclesAhead(vehicle) {
    const pos = vehicle.group.position;
    const dir = vehicle.lane.dir;

    return this.vehicles.filter((other) => {
      if (other === vehicle || !other.alive) return false;
      if (other.lane.dir !== dir) return false;

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
    const start = chance.pickone(PEDESTRIAN_SPAWN_POINTS);
    const key = `${start.x},${start.z}`;
    const target = PEDESTRIAN_TARGETS[key] ?? { x: 0, z: 0 };

    const p = new Pedestrian(this.scene, start, target);
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

    // Scatter nearby pedestrians
    this.pedestrians.forEach((p) => {
      if (!p.alive || !p.crossing) return;
      const pp = p.group.position;
      if (pp.distanceTo(crashPos) < 6) {
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
    };
  }

  dispose() {
    Object.values(this.lights).forEach((l) => l.dispose());
    this.vehicles.forEach((v) => v.dispose());
    this.pedestrians.forEach((p) => p.dispose());
    this.vehicles = [];
    this.pedestrians = [];
  }
}
