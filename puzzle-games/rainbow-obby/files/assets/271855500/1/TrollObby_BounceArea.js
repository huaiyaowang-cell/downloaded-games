var TrollObbyBounceArea = pc.createScript('trollObbyBounceArea');

// initialize code called once per entity
TrollObbyBounceArea.prototype.initialize = function() {
    this.trigger = this.entity.findByName("Trigger");
    this.direction = this.entity.findByName("Cone").up;

    this.id = this.getRandomId();
    this.trigger.script.trollObbyTrigger.fireName = this.id;
    this.trigger.script.trollObbyTrigger.tags = ["Player"];

    this.app.on(this.id, ()=>{
        this.app.playerBounce.bounce(this.direction);
    }, this)

    this.on('destroy', function () {
        this.app.off(this.id);
    }, this);
};

TrollObbyBounceArea.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};
