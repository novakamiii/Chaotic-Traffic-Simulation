import * as THREE from 'three';

let scene, camera, renderer;

export function initScene(container) {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 40, 70);

  // Camera — isometric 2.5D
  const aspect = container.clientWidth / container.clientHeight;
  const viewSize = 22;
  camera = new THREE.OrthographicCamera(
    -viewSize * aspect,
    viewSize * aspect,
    viewSize,
    -viewSize,
    0.1,
    100
  );
  camera.position.set(18, 22, 18);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffeedd, 1.8);
  sun.position.set(15, 25, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
  fill.position.set(-10, 10, -10);
  scene.add(fill);

  // Ground / base plane
  const groundGeo = new THREE.PlaneGeometry(120, 120);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.9,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // Handle resize
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const a = w / h;
    camera.left = -viewSize * a;
    camera.right = viewSize * a;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  return { scene, camera, renderer };
}

export function getScene() {
  return scene;
}

export function getCamera() {
  return camera;
}

export function getRenderer() {
  return renderer;
}
