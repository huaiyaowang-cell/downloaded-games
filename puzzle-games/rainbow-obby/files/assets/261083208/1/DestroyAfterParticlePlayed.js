var DestroyAfterParticlePlayed = pc.createScript('destroyAfterParticlePlayed');

// initialize code called once per entity
DestroyAfterParticlePlayed.prototype.initialize = function () {
    // Referans al
    this.particleSystem = this.entity.particlesystem;

    if (!this.particleSystem) {
        console.warn("DestroyAfterParticlePlayed: Entity has no particlesystem component.");
        return;
    }

    // Süreyi al
    this.lifetime = 1 + this.particleSystem.lifetime + this.particleSystem.rate * this.particleSystem.numParticles / 100;

    // Zamanlayıcı başlat
    this.timer = 0;
};

// update code called every frame
DestroyAfterParticlePlayed.prototype.update = function (dt) {
    if (!this.particleSystem) return;

    this.timer += dt;
    if (this.timer >= this.lifetime) {
        this.entity.destroy();
    }
};
