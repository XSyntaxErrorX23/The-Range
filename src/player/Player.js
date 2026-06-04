import * as THREE from 'three';

/**
 * Player state + a simple third-person body mesh (hidden in first-person).
 * Position is at the feet; the eye sits `eyeHeight` above it.
 */
export class Player {
  constructor(scene) {
    this.position = new THREE.Vector3(0, 0, -6); // start behind the firing line
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.crouching = false;

    this.radius = 0.4;
    this.standHeight = 1.8;
    this.eyeStand = 1.65;
    this.eyeCrouch = 1.05;
    this.eyeHeight = this.eyeStand;

    this.body = this._buildBody();
    this.body.visible = false; // first-person is default
    scene.add(this.body);

    this._eye = new THREE.Vector3();
  }

  _buildBody() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a7d72, roughness: 0.7 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdde7e4, roughness: 0.6 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.85, 4, 10), mat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), headMat);
    head.position.y = 1.72;
    head.castShadow = true;
    g.add(head);

    return g;
  }

  eyePosition() {
    return this._eye.copy(this.position).setY(this.position.y + this.eyeHeight);
  }

  /** Keep the visible body aligned with the player (third-person only). */
  syncBody(yaw) {
    this.body.position.copy(this.position);
    this.body.rotation.y = yaw;
    const squash = this.crouching ? 0.7 : 1;
    this.body.scale.set(1, squash, 1);
  }
}
