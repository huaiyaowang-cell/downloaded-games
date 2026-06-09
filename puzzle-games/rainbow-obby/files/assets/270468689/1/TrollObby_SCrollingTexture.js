var TrollObbySCrollingTexture = pc.createScript('trollObbySCrollingTexture');

TrollObbySCrollingTexture.attributes.add('materialAsset', {
    type: 'asset'
});

TrollObbySCrollingTexture.attributes.add('speed', {
    type: 'vec2',
});
TrollObbySCrollingTexture.attributes.add('opacity', { type: "boolean" });

TrollObbySCrollingTexture.tmpVec2 = new pc.Vec2();
TrollObbySCrollingTexture.tmpOffset = new pc.Vec2();

TrollObbySCrollingTexture.prototype.initialize = function () {
    // get the material that we will animate
    if (this.materialAsset) {
        this.material = this.materialAsset.resource;
    }
};

TrollObbySCrollingTexture.prototype.update = function (dt) {
    if (this.material == null) return;
    var velocity = TrollObbySCrollingTexture.tmpVec2;
    var offset = TrollObbySCrollingTexture.tmpOffset;

    // Calculate how much to offset the texture
    // Speed * dt
    velocity.set(this.speed.x, this.speed.y);
    velocity.scale(dt);

    // Update the diffuse and normal map offset values
    offset.copy(this.material.emissiveMapOffset);
    offset.add(velocity);

    //this.material.offset.set(new pc.Vec2(this.speed.x * dt, 0));
    this.material.emissiveMapOffset = offset;
    this.material.normalMapOffset = offset;
    this.material.diffuseMapOffset = offset;
    if (this.opacity)
        this.material.opacityMapOffset = offset;

    this.material.update();
};
