var TrollObbySection = pc.createScript('trollObbySection');

// initialize code called once per entity
TrollObbySection.prototype.initialize = function() {
    if (!this.app.section){this.app.section = null;}

    this.id = "Section" + this.getRandomId();
    
    this.entity.script.trollObbyTrigger.fireName = this.id;
    this.entity.script.trollObbyTrigger.shouldReplicate = false;
    this.entity.script.trollObbyTrigger.tags = ["Player", "LocalCollider"];

    this.app.on(this.id, this.onTrigger, this);

    this.position = this.entity.findByName("SpawnPosition").getPosition().clone();

    this.on('destroy', function () {
        this.app.off(this.id);
    }, this);
};

TrollObbySection.prototype.onTrigger = function(){
    this.app.section = this.position;
    console.log(this.app.section);
}


TrollObbySection.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};
