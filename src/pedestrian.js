import * as THREE from 'three';
import gsap from 'gsap';
import Chance from 'chance';

const chance = new Chance();

/**
 * Pedestrian with four phases:
 *   1. approaching  — walk along the sidewalk toward the crosswalk corner
 *   2. waiting     — stand at the corner, check walk signal
 *   3. crossing    — cross the road to the opposite sidewalk
 *   4. exiting     — walk away from the intersection on the opposite side
 */
export class Pedestrian {
  constructor(scene, approachX, cornerX, cornerZ, targetX, targetZ, exitX) {
    this.scene = scene;
    this.alive = true;
    this.phase = 'approaching';
    this.finished = false;

    // Path waypoints
    this.approachStart = new THREE.Vector3(approachX, 0, cornerZ);
    this.cornerPos = new THREE.Vector3(cornerX, 0, cornerZ);
    this.targetPos = new THREE.Vector3(targetX, 0, targetZ);
    this.exitEnd = new THREE.Vector3(exitX, 0, targetZ);

    // Cross-phase progress (0→1 for current phase)
    this.progress = 0;

    // Speed & personality
    this.speed = 1.2 + Math.random() * 1.8;
    this.loyalty = chance.floating({ min: 0, max: 1 });
    this.patience = chance.floating({ min: 2, max: 12 });
    this.waitTimer = 0;
    this.hesitates = Math.random() < 0.15;
    this.hesitateTriggered = false;
    this.jaywalking = false;
    this.gender = chance.pickone(['male', 'female']);

    // Build mesh
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: chance.pickone([
        0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12,
        0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1,
        0xf1c40f, 0x2980b9,
      ]),
      roughness: 0.5,
    });

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffdbb5,
      roughness: 0.6,
    });

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      headMat
    );
    head.position.y = 0.65;
    head.castShadow = true;
    this.group.add(head);

    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.35, 6),
      bodyMat
    );
    body.position.y = 0.4;
    body.castShadow = true;
    this.group.add(body);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    [-0.07, 0.07].forEach((xOff) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.2, 4),
        legMat
      );
      leg.position.set(xOff, 0.1, 0);
      this.group.add(leg);
      if (xOff < 0) this.leftLeg = leg;
      else this.rightLeg = leg;
    });

    // Position at approach start
    this.group.position.copy(this.approachStart);
    scene.add(this.group);

    // Face toward the corner
    this.faceToward(this.cornerPos);
  }

  /** Rotate the ped to face a target point */
  faceToward(target) {
    const pos = this.group.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      this.group.rotation.y = Math.atan2(dx, dz);
    }
  }

  /** Walk animation — bob and leg swing */
  animateWalk(phaseProgress) {
    const wave = Math.sin(phaseProgress * Math.PI * 6);
    const bob = wave * 0.02;
    this.group.position.y = bob;
    if (this.leftLeg) this.leftLeg.rotation.x = wave * 0.3;
    if (this.rightLeg) this.rightLeg.rotation.x = -wave * 0.3;
  }

  /**
   * Check if a car is blocking the crosswalk path
   * (only matters during waiting / crossing)
   */
  isCrosswalkBlocked(vehicles) {
    const crosswalkZ = this.cornerPos.z;
    const minX = Math.min(this.cornerPos.x, this.targetPos.x) - 1;
    const maxX = Math.max(this.cornerPos.x, this.targetPos.x) + 1;
    return vehicles.some((v) => {
      if (!v.alive) return false;
      const vPos = v.group.position;
      return Math.abs(vPos.z - crosswalkZ) < 2.5 && vPos.x > minX && vPos.x < maxX;
    });
  }

  update(delta, isWalkGreen, vehicles = []) {
    if (!this.alive || this.finished) return {};

    const pos = this.group.position;
    let result = {};

    switch (this.phase) {

      // ─── Phase 1: Approaching (walk to corner) ─────────────
      case 'approaching': {
        const dx = this.cornerPos.x - this.approachStart.x;
        const dist = Math.abs(dx);
        const step = (this.speed * delta) / dist;
        this.progress = Math.min(this.progress + step, 1);

        pos.x = this.approachStart.x + dx * this.progress;
        pos.z = this.approachStart.z;
        this.animateWalk(this.progress);

        if (this.progress >= 1) {
          // Arrived at corner → wait for walk signal
          this.phase = 'waiting';
          this.progress = 0;
          this.waitTimer = 0;
        }
        break;
      }

      // ─── Phase 2: Waiting at corner ────────────────────────
      case 'waiting': {
        this.waitTimer += delta;
        const impatience = this.waitTimer / this.patience;
        const blocked = this.isCrosswalkBlocked(vehicles);

        // Foot-tapping
        if (impatience > 0.4) {
          const tap = Math.sin(this.waitTimer * 4) * 0.02 * impatience;
          if (this.leftLeg) this.leftLeg.rotation.x = tap;
          if (this.rightLeg) this.rightLeg.rotation.x = -tap;
        }

        // Decision to cross
        if (!blocked && isWalkGreen && this.waitTimer > 0.5) {
          this.startCrossing(false);
        } else if (!blocked && !isWalkGreen && impatience >= 1) {
          this.startCrossing(true);
        } else if (!blocked && !isWalkGreen && impatience > 0.6 && this.loyalty < 0.5) {
          this.startCrossing(true);
        }

        result.waiting = true;
        break;
      }

      // ─── Phase 3: Crossing the road ────────────────────────
      case 'crossing': {
        const blocked = this.isCrosswalkBlocked(vehicles);
        if (blocked) {
          // Stop mid-cross for the car to pass
          result.blocked = true;
          break;
        }

        const dx = this.targetPos.x - this.cornerPos.x;
        const dz = this.targetPos.z - this.cornerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const step = (this.speed * delta) / dist;
        this.progress = Math.min(this.progress + step, 1);

        pos.x = this.cornerPos.x + dx * this.progress;
        pos.z = this.cornerPos.z + dz * this.progress;
        this.animateWalk(this.progress);

        // Jaywalkers speed up
        if (this.jaywalking) {
          this.speed = Math.min(4, this.speed + delta * 2);
        }

        // Hesitation (non-jaywalkers may pause mid-cross)
        if (this.hesitates && !this.hesitateTriggered && this.progress > 0.4 && this.progress < 0.6 && !this.jaywalking) {
          this.hesitateTriggered = true;
          this.speed = 0;
          setTimeout(() => {
            this.speed = 1.2 + Math.random() * 1.8;
          }, 1500 + Math.random() * 2000);
        }

        if (this.progress >= 1) {
          // Made it across → exit away from intersection
          this.phase = 'exiting';
          this.progress = 0;
          this.faceToward(this.exitEnd);
        }

        result.crossing = true;
        result.jaywalking = this.jaywalking;
        break;
      }

      // ─── Phase 4: Exiting (walk away from intersection) ────
      case 'exiting': {
        const dx = this.exitEnd.x - this.targetPos.x;
        const dist = Math.abs(dx);
        const step = (this.speed * delta) / dist;
        this.progress = Math.min(this.progress + step, 1);

        pos.x = this.targetPos.x + dx * this.progress;
        pos.z = this.targetPos.z;
        this.animateWalk(this.progress);

        if (this.progress >= 1) {
          this.finished = true;
          gsap.to(this.group.scale, {
            x: 0, y: 0, z: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => {
              this.alive = false;
              this.dispose();
            },
          });
        }
        break;
      }
    }

    return result;
  }

  startCrossing(jaywalking) {
    this.phase = 'crossing';
    this.jaywalking = jaywalking;
    this.progress = 0;
    // Face toward the opposite corner
    this.faceToward(this.targetPos);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
