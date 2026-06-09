var TrollObbyGlass = pc.createScript('trollObbyGlass');

TrollObbyGlass.attributes.add("shouldBreak", {type:"boolean"});

// initialize code called once per entity
TrollObbyGlass.prototype.initialize = function() {
    if (!this.shouldBreak){
        this.entity.rigidbody.enabled = true;
    } else {
        this.serverId = "glass" + this.getRandomId() + "Server";


        this.trigger = this.entity.findByName("Trigger");
        this.trigger.script.trollObbyTrigger.fireName = this.serverId;
        this.trigger.script.trollObbyTrigger.shouldReplicate = true;
        this.trigger.script.trollObbyTrigger.print = true;
        this.trigger.script.trollObbyTrigger.tags = ["Player"];

        this.app.on(this.serverId, this.onTrigger, this);

        this.on('destroy', function () {
            this.app.off(this.serverId);
        }, this);
    }
};

TrollObbyGlass.prototype.onTrigger = function(){
    this.entity.render.enabled = false;


    setTimeout(()=>{
        if (!this.shouldBreak){this.entity.rigidbody.enabled = true;}
        this.entity.render.enabled = true;
    }, 5*1000);
}


TrollObbyGlass.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};



