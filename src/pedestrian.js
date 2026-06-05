import * as THREE from 'three';
import gsap from 'gsap';
import Chance from 'chance';

const chance = new Chance();

export class Pedestrian {
  constructor(scene, startPos, targetPos) {
    this.scene = scene;
    this.startPos = startPos;
    this.targetPos = targetPos;
    this.alive = true;
    this.crossing = false;
    this.jaywalking = false;
    this.finished = false;
    this.speed = 1.5 + Math.random() * 1.5;
    this.loyalty = chance.floating({ min: 0, max: 1 }); // 0 = always jaywalk, 1 = always obey
    this.patience = chance.floating({ min: 2, max: 12 });
    this.waitTimer = 0;
    this.hesitates = Math.random() < 0.15; // 15% will stop mid-cross
    this.hesitateTriggered = false;

    this.group = new THREE.Group();

    // Body
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

    // Legs (two small cylinders)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
    [-0.07, 0.07].forEach((xOff) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.2, 4),
        legMat
      );
      leg.position.set(xOff, 0.1, 0);
      this.group.add(leg);
      // Store for walk animation
      if (xOff < 0) this.leftLeg = leg;
      else this.rightLeg = leg;
    });

    // Position at start
    this.group.position.set(startPos.x, 0, startPos.z);
    scene.add(this.group);

    // Face toward target
    const dx = targetPos.x - startPos.x;
    const dz = targetPos.z - startPos.z;
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  update(delta, isWalkGreen) {
    if (!this.alive || this.finished) return {};

    if (!this.crossing) {
      // Waiting at sidewalk
      this.waitTimer += delta;

      // Patience check
      const impatience = this.waitTimer / this.patience;

      if (isWalkGreen && this.waitTimer > 0.5) {
        // Walk signal is green — cross legally
        this.startCrossing(false);
      } else if (!isWalkGreen && impatience >= 1) {
        // Patience exhausted — jaywalk!
        this.startCrossing(true);
      } else if (!isWalkGreen && impatience > 0.6 && this.loyalty < 0.5) {
        // Low-loyalty pedestrians jaywalk earlier (at 60% patience)
        this.startCrossing(true);
      }

      // Bounce impatiently while waiting (foot tap)
      if (!this.crossing && impatience > 0.4) {
        const tap = Math.sin(this.waitTimer * 4) * 0.02 * impatience;
        if (this.leftLeg) this.leftLeg.rotation.x = tap;
        if (this.rightLeg) this.rightLeg.rotation.x = -tap;
      }

      return { waiting: true };
    }

    // Crossing
    const pos = this.group.position;
    const dx = this.targetPos.x - this.startPos.x;
    const dz = this.targetPos.z - this.startPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const progress = this.crossProgress ?? 0;

    const step = (this.speed * delta) / dist;
    const newProgress = Math.min(progress + step, 1);
    this.crossProgress = newProgress;

    pos.x = this.startPos.x + dx * newProgress;
    pos.z = this.startPos.z + dz * newProgress;

    // Walk bob animation
    const bob = Math.sin(newProgress * Math.PI * 6) * 0.02;
    if (this.leftLeg) this.leftLeg.rotation.x = Math.sin(newProgress * Math.PI * 6) * 0.3;
    if (this.rightLeg) this.rightLeg.rotation.x = -Math.sin(newProgress * Math.PI * 6) * 0.3;
    pos.y = bob;

    // Hesitate in middle (only non-jaywalkers do this)
    if (this.hesitates && !this.hesitateTriggered && newProgress > 0.4 && newProgress < 0.6 && !this.jaywalking) {
      this.hesitateTriggered = true;
      this.speed = 0;
      setTimeout(() => {
        this.speed = 1.5 + Math.random() * 1.5;
      }, 1500 + Math.random() * 2000);
    }

    // Jaywalkers walk faster (they know they're breaking rules)
    if (this.jaywalking) {
      this.speed = Math.min(4, this.speed + delta * 2); // accelerate
    }

    if (newProgress >= 1) {
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

    return { crossing: true, jaywalking: this.jaywalking };
  }

  startCrossing(jaywalking) {
    this.crossing = true;
    this.jaywalking = jaywalking;
    this.crossProgress = 0;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
