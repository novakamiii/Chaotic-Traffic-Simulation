import * as THREE from 'three';
import gsap from 'gsap';

const STATES = {
  RED: 'red',
  RED_YELLOW: 'red_yellow',
  GREEN: 'green',
  YELLOW: 'yellow',
};

const CYCLE = {
  [STATES.RED]: { duration: () => 12 + Math.random() * 18 },
  [STATES.RED_YELLOW]: { duration: 2 },
  [STATES.GREEN]: { duration: () => 4 + Math.random() * 8 },
  [STATES.YELLOW]: { duration: 2 },
};

export class TrafficLight {
  constructor(scene, position) {
    this.scene = scene;
    this.position = position;
    this.state = STATES.RED;
    this.group = new THREE.Group();
    this.bulbs = {};
    this.glowLights = {};

    this.build();
    this.group.position.set(position.x, 0, position.z);
    this.group.position.y = 0;
    scene.add(this.group);
  }

  build() {
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x444466,
      roughness: 0.5,
      metalness: 0.6,
    });

    // Vertical pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 3, 8),
      poleMat
    );
    pole.position.y = 1.5;
    pole.castShadow = true;
    this.group.add(pole);

    // Horizontal arm
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
      poleMat
    );
    arm.position.set(0.6, 2.8, 0);
    arm.rotation.z = -Math.PI / 2;
    arm.castShadow = true;
    this.group.add(arm);

    // Light housing
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x222233,
      roughness: 0.7,
    });

    const housingPositions = [
      { x: 0, y: 2.6, z: 0 },
      { x: 0, y: 2.2, z: 0 },
      { x: 0, y: 1.8, z: 0 },
    ];

    const colors = [0xff1a1a, 0xffaa00, 0x00ff88];
    const keys = ['red', 'yellow', 'green'];
    const intensities = { red: 0.15, yellow: 0.1, green: 0.1 };
    const activeIntensities = { red: 1.2, yellow: 0.8, green: 1.0 };

    housingPositions.forEach((pos, i) => {
      // Housing box
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.3, 0.5),
        housingMat
      );
      housing.position.set(pos.x, pos.y, pos.z);
      this.group.add(housing);

      // Bulb (glowing sphere)
      const bulbMat = new THREE.MeshStandardMaterial({
        color: colors[i],
        emissive: colors[i],
        emissiveIntensity: intensities[keys[i]],
      });
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        bulbMat
      );
      bulb.position.set(pos.x + 0.1, pos.y, pos.z);
      this.group.add(bulb);

      this.bulbs[keys[i]] = bulb;

      // Small point light for glow
      const light = new THREE.PointLight(colors[i], 0, 3);
      light.position.set(pos.x + 0.1, pos.y, pos.z);
      this.group.add(light);
      this.glowLights[keys[i]] = { light, intensity: activeIntensities[keys[i]] };
    });
  }

  setState(newState) {
    this.state = newState;

    const bulbConfig = {
      red: newState === STATES.RED || newState === STATES.RED_YELLOW,
      yellow: newState === STATES.RED_YELLOW || newState === STATES.YELLOW,
      green: newState === STATES.GREEN,
    };

    Object.entries(bulbConfig).forEach(([key, active]) => {
      const bulb = this.bulbs[key];
      if (!bulb) return;

      gsap.to(bulb.material, {
        emissiveIntensity: active ? this.glowLights[key].intensity : 0.1,
        duration: 0.3,
        ease: 'power2.out',
      });

      gsap.to(this.glowLights[key].light, {
        intensity: active ? this.glowLights[key].intensity : 0,
        duration: 0.3,
        ease: 'power2.out',
      });
    });
  }

  getNextState() {
    switch (this.state) {
      case STATES.RED:
        return STATES.RED_YELLOW;
      case STATES.RED_YELLOW:
        return STATES.GREEN;
      case STATES.GREEN:
        return STATES.YELLOW;
      case STATES.YELLOW:
        return STATES.RED;
      default:
        return STATES.RED;
    }
  }

  getStateDuration() {
    const dur = CYCLE[this.state].duration;
    return typeof dur === 'function' ? dur() : dur;
  }

  isGreen() {
    return this.state === STATES.GREEN;
  }

  isRed() {
    return this.state === STATES.RED || this.state === STATES.RED_YELLOW;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
