var TrollObbyTimedPlatform = pc.createScript('trollObbyTimedPlatform');

// initialize code called once per entity
TrollObbyTimedPlatform.prototype.initialize = function() {

    this.serverId = "timedPlatform" + this.getRandomId() + "Server";

    this.trigger = this.entity.findByName("Trigger");
    this.platform = this.entity.findByName("Platform");

    this.trigger.script.trollObbyTrigger.fireName = this.serverId;
    this.trigger.script.trollObbyTrigger.shouldReplicate = true;
    this.trigger.script.trollObbyTrigger.print = false;
    this.trigger.script.trollObbyTrigger.tags = ["Player"];

    this.app.on(this.serverId, this.onTrigger, this);

    let scale = this.platform.getScale();
    let scaleVec = new pc.Vec3(scale.x / 2,scale.y / 2,scale.z / 2);
    this.platform.collision.halfExtents = scaleVec;
    this.trigger.collision.halfExtents = scaleVec;

    let meshInstances = this.platform.render.meshInstances;
    this.baseMaterial = meshInstances[0].material;
    this.material = this.baseMaterial.clone();
    this.material.update();

    for (let i = 0; i < meshInstances.length; i++) {
        meshInstances[i].material = this.material;
    }

    this.active = false;

    this.on('destroy', function () {
        this.app.off(this.serverId);
    }, this);
};

TrollObbyTimedPlatform.prototype.onTrigger = function(){
    if (this.active){return;}else{this.active = true;}
    this.platform.fire("Motion", "shake");

    setTimeout(()=>{
        this.setOpacity(1);
        this.platform.fire("Motion:Stop", "shake");

        this.tweenOpacity(1,0);
        setTimeout(()=>{this.platform.rigidbody.enabled = false;}, 150);

        setTimeout(()=>{
            this.tweenOpacity(0,1);
            setTimeout(()=>{this.active = false;}, 600);
            setTimeout(()=>{this.platform.rigidbody.enabled = true;}, 150);
        }, 3*1000);
    }, .25*1000);
}

TrollObbyTimedPlatform.prototype.setOpacity = function (value) {
    this.material.opacity = value;
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.update();
};

TrollObbyTimedPlatform.prototype.tweenOpacity = function(value1, value2){
    let o = {t:value1};
    let code = this;
    this.entity.tween(o)
        .to({t:value2}, .3, pc.Linear)
        .onUpdate(function () {
            code.setOpacity(o.t);
        })
        .start();
}

TrollObbyTimedPlatform.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};