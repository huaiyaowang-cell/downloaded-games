var TrollObbyRotator = pc.createScript('trollObbyRotator');

TrollObbyRotator.attributes.add('speed', { type: 'vec3', default: [30, 0, 0] });
TrollObbyRotator.attributes.add('rotateGlobally', { type: 'boolean', default: false });
// update code called every frame
TrollObbyRotator.prototype.update = function (dt) {
    if (this.rotateGlobally) {
        this.entity.rotate(this.speed.x * dt, this.speed.y * dt, this.speed.z * dt);
    } else {
        this.entity.rotateLocal(this.speed.x * dt, this.speed.y * dt, this.speed.z * dt);
    }
};
