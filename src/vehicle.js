import * as THREE from 'three';
import gsap from 'gsap';
import Chance from 'chance';

const chance = new Chance();

// Turn path definitions — where each car goes at the intersection
// start = entry point, mid = center of intersection, end = exit point, newDir = direction after turn
const TURN_PATHS = {
  north: {
    left:  { start: { x: -1.75, z: 4.5 }, mid: { x: -1.75, z: 0 }, end: { x: -5, z: 1.75 }, newDir: 'west' },
    right: { start: { x: -1.75, z: 4.5 }, mid: { x: -1.75, z: 0 }, end: { x: 5, z: -1.75 }, newDir: 'east' },
  },
  south: {
    left:  { start: { x: 1.75, z: -4.5 }, mid: { x: 1.75, z: 0 }, end: { x: 5, z: -1.75 }, newDir: 'east' },
    right: { start: { x: 1.75, z: -4.5 }, mid: { x: 1.75, z: 0 }, end: { x: -5, z: 1.75 }, newDir: 'west' },
  },
  east: {
    left:  { start: { x: 4.5, z: -1.75 }, mid: { x: 0, z: -1.75 }, end: { x: -1.75, z: -5 }, newDir: 'north' },
    right: { start: { x: 4.5, z: -1.75 }, mid: { x: 0, z: -1.75 }, end: { x: 1.75, z: 5 }, newDir: 'south' },
  },
  west: {
    left:  { start: { x: -4.5, z: 1.75 }, mid: { x: 0, z: 1.75 }, end: { x: 1.75, z: 5 }, newDir: 'south' },
    right: { start: { x: -4.5, z: 1.75 }, mid: { x: 0, z: 1.75 }, end: { x: -1.75, z: -5 }, newDir: 'north' },
  },
};

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
    this.dir = lane.dir; // mutable — changes when car turns at intersection
    this.alive = true;
    this.stopped = false;
    this.aggression = chance.floating({ min: 0, max: 1 });

    // Turn intent — pick at spawn
    const r = Math.random();
    this.intent = r < 0.5 ? 'straight' : r < 0.76 ? 'left' : 'right';

    // Turn animation state
    this.turning = false;
    this.turnProgress = 0;
    this.turnPath = null;
    this.turnLength = 0;
    this.turned = false;
    // Speed spread: aggressive cars are faster (6-10), patient cars are slower (1.5-5)
    this.baseSpeed = 1.5 + this.aggression * 8.5; // 1.5 → 10 range
    this.speed = this.baseSpeed;
    this.patience = 5 + (1 - this.aggression) * 15; // low aggression = more patient (5-20s)
    this.hp = 3;
    this.maxHp = 3;
    this.lastHitTime = 0;
    this.waitTimer = 0;
    this.honkCooldown = 0;

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

  update(delta, intersection, lightState, nearbyAhead = [], oncoming = []) {
    if (!this.alive) return {};

    const dir = this.dir;
    const pos = this.group.position;
    let ranRed = false;
    let honked = false;

    // ─── Turn animation handling ─────────────────────────────────────
    if (this.turning && this.turnPath) {
      this.turnProgress += (this.speed * delta) / this.turnLength;

      if (this.turnProgress >= 1) {
        // Turn complete — snap to exit position and switch direction
        const end = this.turnPath.end;
        pos.set(end.x, 0, end.z);
        this.dir = this.turnPath.newDir;
        this.intent = 'straight';
        this.turning = false;
        this.turned = true;
        // Set rotation for the new direction
        switch (this.dir) {
          case 'north': this.group.rotation.y = 0; break;
          case 'south': this.group.rotation.y = Math.PI; break;
          case 'east':  this.group.rotation.y = Math.PI / 2; break;
          case 'west':  this.group.rotation.y = -Math.PI / 2; break;
        }
      } else {
        // Interpolate along the path: start→mid→end, speed-normalised
        const t = this.turnProgress;
        const s = this.turnPath.start;
        const m = this.turnPath.mid;
        const e = this.turnPath.end;

        const d1 = Math.sqrt((m.x - s.x) ** 2 + (m.z - s.z) ** 2);
        const d2 = Math.sqrt((e.x - m.x) ** 2 + (e.z - m.z) ** 2);
        const midT = d1 / (d1 + d2);

        let px, pz, nx, nz;
        const step = (lt) => lt * lt * (3 - 2 * lt); // smoothstep

        if (t < midT) {
          const lt = t / midT;
          const st = step(lt);
          px = s.x + (m.x - s.x) * st;
          pz = s.z + (m.z - s.z) * st;
          // Next position for rotation
          const nlt = Math.min(1, (t + 0.005) / midT);
          const nst = step(nlt);
          nx = s.x + (m.x - s.x) * nst;
          nz = s.z + (m.z - s.z) * nst;
        } else {
          const lt = (t - midT) / (1 - midT);
          const st = step(lt);
          px = m.x + (e.x - m.x) * st;
          pz = m.z + (e.z - m.z) * st;
          const nlt = Math.min(1, (t - midT + 0.005) / (1 - midT));
          const nst = step(nlt);
          nx = m.x + (e.x - m.x) * nst;
          nz = m.z + (e.z - m.z) * nst;
        }

        pos.set(px, 0, pz);
        const dx = nx - px;
        const dz = nz - pz;
        if (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001) {
          this.group.rotation.y = Math.atan2(dx, -dz);
        }
      }

      // Never stop while turning
      this.stopped = false;
      this.speed = Math.max(this.baseSpeed * 0.6, this.speed);
      this.waitTimer = 0;
      return {};
    }

    // ─── Initiate turn when entering the intersection ────────────────
    const inIntersection = Math.abs(pos.x) < 4.5 && Math.abs(pos.z) < 4.5;

    if (inIntersection && this.intent !== 'straight' && !this.turned) {
      const path = TURN_PATHS[dir]?.[this.intent];
      if (path) {
        this.turnPath = path;
        this.turning = true;
        this.turnProgress = 0;
        const d1 = Math.sqrt((path.mid.x - path.start.x) ** 2 + (path.mid.z - path.start.z) ** 2);
        const d2 = Math.sqrt((path.end.x - path.mid.x) ** 2 + (path.end.z - path.mid.z) ** 2);
        this.turnLength = d1 + d2;
        // Snap to start position
        pos.set(path.start.x, 0, path.start.z);
        // Process the first turn frame
        this.turnProgress = (this.speed * delta) / this.turnLength;
        return {};
      }
      // No path found — fall through to straight
      this.intent = 'straight';
    }

    // ─── Position relative to intersection (for straight / approach) ─
    let beforeIntersection = false;
    switch (dir) {
      case 'north': beforeIntersection = pos.z > 4.5 && pos.z < 22 && !inIntersection; break;
      case 'south': beforeIntersection = pos.z < -4.5 && pos.z > -22 && !inIntersection; break;
      case 'east':  beforeIntersection = pos.x < -4.5 && pos.x > -22 && !inIntersection; break;
      case 'west':  beforeIntersection = pos.x > 4.5 && pos.x < 22 && !inIntersection; break;
    }

    // Check if intersection is blocked (stopped car OR turning car ahead)
    const interBlocked = nearbyAhead.some((other) => {
      if (!other.alive) return false;
      const oPos = other.group.position;
      const inInter = Math.abs(oPos.x) < 5 && Math.abs(oPos.z) < 5;
      // Blocked if stopped, OR if still turning through
      return inInter && (other.stopped || other.intent !== 'straight');
    });

    // Generic tailgating — car too close ahead
    const tailgating = nearbyAhead.some((other) => {
      if (!other.alive) return false;
      return pos.distanceTo(other.group.position) < 4;
    });

    // ─── Distance to stop line ───────────────────────────────────────
    let distToStop = Infinity;
    switch (dir) {
      case 'north': distToStop = pos.z - 4.5; break;
      case 'south': distToStop = -4.5 - pos.z; break;
      case 'east':  distToStop = -4.5 - pos.x; break;
      case 'west':  distToStop = pos.x - 4.5; break;
    }

    // ─── Decision logic ──────────────────────────────────────────────
    if (inIntersection) {
      // Already inside — MUST clear it. Never stop. Speed up.
      this.stopped = false;
      const maxInterSpeed = Math.max(this.baseSpeed * 1.3, 4);
      this.speed = Math.min(maxInterSpeed, this.speed + delta * 2);
      this.waitTimer = 0;
    } else if (beforeIntersection && interBlocked) {
      // Approach is clear but intersection is occupied — wait
      this.stopped = true;
    } else if (tailgating) {
      // Too close to the car ahead
      this.stopped = true;
    } else if (beforeIntersection && lightState === 'red') {
      // Coast to the stop line — don't slam brakes at z=20
      if (distToStop < 0.8) {
        // At the stop line — stop
        this.stopped = true;
      } else {
        // Coast toward the stop line at a reduced speed
        this.stopped = false;
        const minCrawl = Math.max(0.5, this.baseSpeed * 0.15);
        this.speed = Math.max(minCrawl, Math.min(this.baseSpeed, distToStop * 1.8));
      }
    } else if (beforeIntersection && this.intent === 'left' && !this.turned && oncoming.length > 0 && distToStop < 6) {
      // Yield to oncoming traffic before turning left
      this.stopped = true;
    } else {
      this.stopped = false;
    }

    // Ease speed back to base when freely moving (not coasting to a red light)
    if (!inIntersection && !this.stopped && !(beforeIntersection && lightState === 'red')) {
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

  takeDamage(amount, scene) {
    if (!this.alive) return;

    this.hp -= amount;
    this.lastHitTime = performance.now();

    // Flash the car body red briefly
    const bodyMesh = this.group.children[0];
    if (bodyMesh && bodyMesh.material) {
      const origColor = bodyMesh.material.color.getHex();
      bodyMesh.material.emissive.setHex(0xff0000);
      bodyMesh.material.emissiveIntensity = 0.6;
      gsap.to(bodyMesh.material, {
        emissiveIntensity: 0,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: () => {
          bodyMesh.material.emissive.setHex(0x000000);
        },
      });
    }

    if (this.hp <= 0) {
      this.explode(scene);
    }
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
