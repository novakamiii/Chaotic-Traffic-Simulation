import * as THREE from 'three';

const ROAD_WIDTH = 8;
const LANE_WIDTH = 3.5;
const SIDEWALK_WIDTH = 1.5;
const HALF_ROAD = ROAD_WIDTH / 2;
const INTERSECTION_SIZE = ROAD_WIDTH;
const ROAD_LENGTH = 50;

export const LANES = {
  // North-south road (Z-axis)
  nsNorth: { x: -LANE_WIDTH / 2, z: 0, dir: 'north', angle: 0 },
  nsSouth: { x: LANE_WIDTH / 2, z: 0, dir: 'south', angle: 0 },
  // East-west road (X-axis)
  ewEast: { x: 0, z: -LANE_WIDTH / 2, dir: 'east', angle: Math.PI / 2 },
  ewWest: { x: 0, z: LANE_WIDTH / 2, dir: 'west', angle: Math.PI / 2 },
};

// Spawn points — each direction spawns at the opposite side and drives toward center
// Northbound: spawn south (z=+50), drive north (z decreasing)
// Southbound: spawn north (z=-50), drive south (z increasing)
// Eastbound:  spawn west (x=-50), drive east (x increasing)
// Westbound:  spawn east (x=+50), drive west (x decreasing)
export const SPAWN_POINTS = {
  north: { x: -LANE_WIDTH / 2, z: ROAD_LENGTH },
  south: { x: LANE_WIDTH / 2, z: -ROAD_LENGTH },
  east: { x: -ROAD_LENGTH, z: -LANE_WIDTH / 2 },
  west: { x: ROAD_LENGTH, z: LANE_WIDTH / 2 },
};

// Intersection bounds (cars stop here on red)
export const INTERSECTION = {
  minX: -HALF_ROAD,
  maxX: HALF_ROAD,
  minZ: -HALF_ROAD,
  maxZ: HALF_ROAD,
};

// Crosswalk positions
export const CROSSWALKS = {
  north: { x: 0, z: -(HALF_ROAD + 1), width: ROAD_WIDTH },
  south: { x: 0, z: HALF_ROAD + 1, width: ROAD_WIDTH },
  east: { x: HALF_ROAD + 1, z: 0, width: ROAD_WIDTH },
  west: { x: -(HALF_ROAD + 1), z: 0, width: ROAD_WIDTH },
};

// Sidewalk positions (pedestrian spawn/wait areas)
export const SIDEWALKS = {
  northWest: { x: -(HALF_ROAD + SIDEWALK_WIDTH / 2), z: -(HALF_ROAD + SIDEWALK_WIDTH / 2) },
  northEast: { x: HALF_ROAD + SIDEWALK_WIDTH / 2, z: -(HALF_ROAD + SIDEWALK_WIDTH / 2) },
  southWest: { x: -(HALF_ROAD + SIDEWALK_WIDTH / 2), z: HALF_ROAD + SIDEWALK_WIDTH / 2 },
  southEast: { x: HALF_ROAD + SIDEWALK_WIDTH / 2, z: HALF_ROAD + SIDEWALK_WIDTH / 2 },
};

// Traffic light corner positions
export const LIGHT_POSITIONS = {
  ns: { x: -(HALF_ROAD + 0.5), z: -(HALF_ROAD + 0.5) },
  ew: { x: HALF_ROAD + 0.5, z: HALF_ROAD + 0.5 },
};

export function buildIntersection(scene) {
  const group = new THREE.Group();

  // ─── Roads ─────────────────────────────────────────────────────────
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x2d2d44,
    roughness: 0.9,
  });

  // NS road
  const nsRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH * 2),
    roadMat
  );
  nsRoad.rotation.x = -Math.PI / 2;
  nsRoad.position.set(0, 0, 0);
  nsRoad.receiveShadow = true;
  group.add(nsRoad);

  // EW road
  const ewRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_LENGTH * 2, ROAD_WIDTH),
    roadMat
  );
  ewRoad.rotation.x = -Math.PI / 2;
  ewRoad.position.set(0, 0, 0);
  ewRoad.receiveShadow = true;
  group.add(ewRoad);

  // ─── Lane markings ─────────────────────────────────────────────────
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0xccd6f6,
    emissive: 0x445566,
    emissiveIntensity: 0.3,
  });

  function addDashes(start, end, x, step) {
    const dashLen = 1.5;
    const gap = 1.5;
    const totalLen = end - start;
    const count = Math.floor(totalLen / (dashLen + gap));
    for (let i = 0; i < count; i++) {
      const zPos = start + i * (dashLen + gap) + dashLen / 2;
      // Skip intersection
      if (Math.abs(zPos) < HALF_ROAD + 1) continue;
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, dashLen),
        dashMat
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, zPos);
      group.add(dash);
    }
  }

  // NS lane center marking
  addDashes(-ROAD_LENGTH, ROAD_LENGTH, 0, 3);

  // EW lane center marking (rotated)
  function addDashesEW(start, end, z, step) {
    const dashLen = 1.5;
    const gap = 1.5;
    const totalLen = end - start;
    const count = Math.floor(totalLen / (dashLen + gap));
    for (let i = 0; i < count; i++) {
      const xPos = start + i * (dashLen + gap) + dashLen / 2;
      if (Math.abs(xPos) < HALF_ROAD + 1) continue;
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(dashLen, 0.15),
        dashMat
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(xPos, 0.02, z);
      group.add(dash);
    }
  }
  addDashesEW(-ROAD_LENGTH, ROAD_LENGTH, 0, 3);

  // ─── Crosswalks ────────────────────────────────────────────────────
  const crossMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
  });

  function addCrosswalk(centerX, centerZ, alongX, count) {
    const stripW = 0.4;
    const stripGap = 0.3;
    const stripLen = ROAD_WIDTH - 1;
    const totalW = count * stripW + (count - 1) * stripGap;
    const start = -totalW / 2 + stripW / 2;

    for (let i = 0; i < count; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(
          alongX ? stripW : stripLen,
          alongX ? stripLen : stripW
        ),
        crossMat
      );
      strip.rotation.x = -Math.PI / 2;
      if (alongX) {
        strip.position.set(centerX + start + i * (stripW + stripGap), 0.03, centerZ);
      } else {
        strip.position.set(centerX, 0.03, centerZ + start + i * (stripW + stripGap));
      }
      group.add(strip);
    }
  }

  // Four crosswalks around the intersection
  addCrosswalk(0, -(HALF_ROAD + 0.5), false, 8);
  addCrosswalk(0, HALF_ROAD + 0.5, false, 8);
  addCrosswalk(-(HALF_ROAD + 0.5), 0, true, 8);
  addCrosswalk(HALF_ROAD + 0.5, 0, true, 8);

  // ─── Sidewalks ─────────────────────────────────────────────────────
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a55,
    roughness: 0.8,
  });

  const sw = SIDEWALK_WIDTH;
  // Four corner sidewalk squares
  const corners = [
    [-(HALF_ROAD + sw / 2), -(HALF_ROAD + sw / 2)],
    [HALF_ROAD + sw / 2, -(HALF_ROAD + sw / 2)],
    [-(HALF_ROAD + sw / 2), HALF_ROAD + sw / 2],
    [HALF_ROAD + sw / 2, HALF_ROAD + sw / 2],
  ];

  corners.forEach(([cx, cz]) => {
    const swMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(sw, sw),
      sideMat
    );
    swMesh.rotation.x = -Math.PI / 2;
    swMesh.position.set(cx, 0.01, cz);
    swMesh.receiveShadow = true;
    group.add(swMesh);
  });

  // Sidewalk strips along roads
  const stripGeo = new THREE.PlaneGeometry(SIDEWALK_WIDTH, ROAD_LENGTH * 2 - ROAD_WIDTH);

  [- (HALF_ROAD + sw / 2), (HALF_ROAD + sw / 2)].forEach((xOff) => {
    const strip = new THREE.Mesh(stripGeo, sideMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(xOff, 0.01, 0);
    strip.receiveShadow = true;
    group.add(strip);
  });

  const stripGeoEW = new THREE.PlaneGeometry(ROAD_LENGTH * 2 - ROAD_WIDTH, SIDEWALK_WIDTH);
  [- (HALF_ROAD + sw / 2), (HALF_ROAD + sw / 2)].forEach((zOff) => {
    const strip = new THREE.Mesh(stripGeoEW, sideMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.01, zOff);
    strip.receiveShadow = true;
    group.add(strip);
  });

  // ─── Intersection center ───────────────────────────────────────────
  const centerMat = new THREE.MeshStandardMaterial({
    color: 0x222238,
    roughness: 0.9,
  });
  const center = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH),
    centerMat
  );
  center.rotation.x = -Math.PI / 2;
  center.position.set(0, 0.005, 0);
  group.add(center);

  scene.add(group);
  return group;
}
