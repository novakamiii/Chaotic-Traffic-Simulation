import * as THREE from 'three';
import gsap from 'gsap';
import Chance from 'chance';

const chance = new Chance();

const BODY_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12,
  0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1,
  0xf1c40f, 0x2980b9, 0xd35400, 0x7f8c8d,
  0xc0392b, 0x16a085, 0x8e44ad, 0x2c3e50,
];

export class Vehicle {
  constructor(scene, lane, spawnZ) {
    this.scene = scene;
    this.lane = lane;
    this.alive = true;
    this.stopped = false;
    this.speed = 3 + Math.random() * 4;
    this.baseSpeed = this.speed;
    this.aggression = chance.floating({ min: 0, max: 1 });
    this.patience = 5 + (1 - this.aggression) * 15; // low aggression = more patient (5-20s)
    this.waitTimer = 0;
    this.honkCooldown = 0;
    this.honkInterval = 0;

    const color = chance.pickone(BODY_COLORS);

    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.3,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.6,
    });

    // Main body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 3.2),
      bodyMat
    );
    body.position.y = 0.4;
    body.castShadow = true;
    this.group.add(body);

    // Cabin (raised center)
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.4, 1.6),
      glassMat
    );
    cabin.position.set(0, 0.8, -0.2);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9,
    });

    const wheelPos = [
      [-0.85, 0.15, -1.0],
      [0.85, 0.15, -1.0],
      [-0.85, 0.15, 1.0],
      [0.85, 0.15, 1.0],
    ];

    wheelPos.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8),
        wheelMat
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      this.group.add(wheel);
    });

    // Headlights
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffffcc,
      emissiveIntensity: 0.3,
    });
    const hl1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lightMat);
    hl1.position.set(-0.4, 0.3, -1.65);
    this.group.add(hl1);

    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), lightMat);
    hl2.position.set(0.4, 0.3, -1.65);
    this.group.add(hl2);

    // Rear lights
    const rearMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.15,
    });
    const rl1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), rearMat);
    rl1.position.set(-0.4, 0.3, 1.65);
    this.group.add(rl1);

    const rl2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), rearMat);
    rl2.position.set(0.4, 0.3, 1.65);
    this.group.add(rl2);

    // Position
    if (lane.dir === 'north' || lane.dir === 'south') {
      this.group.position.set(lane.x, 0, spawnZ ?? 0);
      this.group.rotation.y = lane.dir === 'north' ? 0 : Math.PI;
    } else {
      this.group.position.set(spawnZ ?? 0, 0, lane.z);
      this.group.rotation.y = lane.dir === 'east' ? Math.PI / 2 : -Math.PI / 2;
    }

    this.spawnZ = spawnZ ?? 0;
    scene.add(this.group);
  }

  update(delta, intersection, lightState, nearbyAhead = []) {
    if (!this.alive) return {};

    const dir = this.lane.dir;
    const pos = this.group.position;
    let ranRed = false;
    let honked = false;

    // ─── Position relative to intersection ───────────────────────────
    const inIntersection = Math.abs(pos.x) < 4.5 && Math.abs(pos.z) < 4.5;

    // "Before intersection" = approaching the stop line (direction-aware)
    let beforeIntersection = false;
    switch (dir) {
      case 'north': beforeIntersection = pos.z > 4.5 && !inIntersection; break;
      case 'south': beforeIntersection = pos.z < -4.5 && !inIntersection; break;
      case 'east':  beforeIntersection = pos.x < -4.5 && !inIntersection; break;
      case 'west':  beforeIntersection = pos.x > 4.5 && !inIntersection; break;
    }

    // Check if intersection is blocked by a stopped car
    const interBlocked = nearbyAhead.some((other) => {
      if (!other.alive) return false;
      const oPos = other.group.position;
      return Math.abs(oPos.x) < 5 && Math.abs(oPos.z) < 5 && other.stopped;
    });

    // Generic tailgating — car too close ahead
    const tailgating = nearbyAhead.some((other) => {
      if (!other.alive) return false;
      return pos.distanceTo(other.group.position) < 4;
    });

    // ─── Decision logic ──────────────────────────────────────────────
    if (inIntersection) {
      // Already inside — MUST clear it. Never stop. Speed up.
      this.stopped = false;
      this.speed = Math.min(8, this.speed + delta * 2);
      this.waitTimer = 0;
    } else if (beforeIntersection && interBlocked) {
      // Approach is clear but intersection is occupied — wait
      this.stopped = true;
    } else if (tailgating) {
      // Too close to the car ahead
      this.stopped = true;
    } else if (beforeIntersection && lightState === 'red') {
      // Normal red light stop
      this.stopped = true;
    } else {
      this.stopped = false;
    }

    // Ease speed back to base when not in intersection
    if (!inIntersection) {
      this.speed += (this.baseSpeed - this.speed) * 0.05;
    }

    // ─── Patience system — only applies when stopped BEFORE intersection
    if (this.stopped) {
      this.waitTimer += delta;
      const impatience = this.waitTimer / this.patience;

      if (impatience > 0.3 && this.honkCooldown <= 0) {
        const honkChance = Math.min(0.3, impatience * 0.03);
        if (Math.random() < honkChance) {
          honked = true;
          this.honkCooldown = Math.max(0.5, 3 - impatience * 2.5);
        }
      }

      if (impatience >= 1) {
        this.stopped = false;
        this.waitTimer = 0;
        ranRed = true;
      }
    } else {
      this.waitTimer = 0;
    }

    // ─── Honk cooldown ───────────────────────────────────────────────
    this.honkCooldown -= delta;

    // ─── Move ────────────────────────────────────────────────────────
    if (!this.stopped) {
      const moveSpeed = this.speed * delta;
      if (dir === 'north') pos.z -= moveSpeed;
      else if (dir === 'south') pos.z += moveSpeed;
      else if (dir === 'east') pos.x += moveSpeed;
      else if (dir === 'west') pos.x -= moveSpeed;
    }

    // Check if off-screen — remove
    if (Math.abs(pos.x) > 55 || Math.abs(pos.z) > 55) {
      this.alive = false;
      return { offscreen: true };
    }

    const result = {};
    if (ranRed) result.ranRed = true;
    if (honked) result.honk = true;
    return result;
  }

  explode(scene) {
    this.alive = false;
    const pos = this.group.position.clone();

    // Remove car from scene immediately — no sitting around
    scene.remove(this.group);

    // Create debris particles
    const particleCount = 40;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const carColor = new THREE.Color(
      this.group.children[0]?.material?.color ?? 0xff0000
    );

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 0.5 + Math.random() * 2;

      positions[i * 3] = pos.x + r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = pos.y + Math.random() * 2;
      positions[i * 3 + 2] = pos.z + r * Math.sin(theta) * Math.sin(phi);

      const c = carColor.clone().lerp(new THREE.Color(0xff8800), Math.random() * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      sizes[i] = 0.1 + Math.random() * 0.3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    // Animate particles outward
    const targetPos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 5;
      targetPos[i * 3] = pos.x + Math.cos(angle) * dist;
      targetPos[i * 3 + 1] = pos.y + Math.random() * 3;
      targetPos[i * 3 + 2] = pos.z + Math.sin(angle) * dist;
    }

    const startPos = [...positions];
    const duration = 1 + Math.random() * 0.5;

    gsap.to({ t: 0 }, {
      t: 1,
      duration,
      ease: 'power2.out',
      onUpdate: function () {
        const t = this.targets()[0].t;
        const p = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
          p[i * 3] = startPos[i * 3] + (targetPos[i * 3] - startPos[i * 3]) * t;
          p[i * 3 + 1] = startPos[i * 3 + 1] + (targetPos[i * 3 + 1] - startPos[i * 3 + 1]) * t +
            Math.sin(t * Math.PI) * 2;
          p[i * 3 + 2] = startPos[i * 3 + 2] + (targetPos[i * 3 + 2] - startPos[i * 3 + 2]) * t;
        }
        particles.geometry.attributes.position.needsUpdate = true;
      },
      onComplete: () => {
        gsap.to(particles.material, {
          opacity: 0,
          duration: 0.5,
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
    this.scene.remove(this.group);
  }
}
