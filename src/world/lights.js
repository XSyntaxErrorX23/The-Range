import * as THREE from 'three';

/**
 * Lighting for the indoor range: one shadow-casting directional light with a
 * tight frustum, plus cheap hemisphere + ambient fill. Warm haze fog for depth.
 */
export function setupLights(scene) {
  scene.background = new THREE.Color(0xd8cbb0);
  scene.fog = new THREE.Fog(0xd8cbb0, 32, 85);

  const sun = new THREE.DirectionalLight(0xfff2dd, 1.05);
  sun.position.set(16, 18, 4);
  sun.target.position.set(0, 0, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  const c = sun.shadow.camera;
  c.left = -30; c.right = 30; c.top = 42; c.bottom = -18; c.near = 0.5; c.far = 80;
  c.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xfff0d8, 0xb59a70, 0.6);
  scene.add(hemi);

  const amb = new THREE.AmbientLight(0x403828, 0.25);
  scene.add(amb);

  return { sun, hemi, amb };
}
