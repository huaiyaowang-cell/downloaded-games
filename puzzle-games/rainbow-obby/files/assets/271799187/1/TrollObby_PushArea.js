var TrollObbyPushArea = pc.createScript('trollObbyPushArea');

// initialize code called once per entity
TrollObbyPushArea.prototype.initialize = function() {

    this.trigger = this.entity.findByName("Trigger");
    this.direction = this.entity.findByName("Cone").up;

    let scale = this.entity.getScale();
    this.trigger.collision.halfExtents = new pc.Vec3(
        scale.x / 2,
        scale.y / 2,
        scale.z / 2,
    );

    this.id = this.getRandomId();
    this.idLeave = this.id+"Leave"
    this.trigger.script.trollObbyTrigger.fireName = this.id; //this.app.playerPush.signalActivate;
    this.trigger.script.trollObbyTrigger.fireNameLeave = this.idLeave; //this.app.playerPush.signalDeactivate;
    this.trigger.script.trollObbyTrigger.tags = ["Player"];

    this.app.on(this.id, ()=>{
        this.app.playerPush.direction = this.direction;
        this.app.playerPush.active = true;
    }, this)

    this.app.on(this.idLeave, ()=>{
        this.app.playerPush.active = false;
    }, this)

    this.on('destroy', function () {
        this.app.off(this.id);
        this.app.off(this.idLeave);
    }, this);
};

TrollObbyPushArea.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};

