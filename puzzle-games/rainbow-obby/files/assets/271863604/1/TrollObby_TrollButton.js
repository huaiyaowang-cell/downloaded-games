var TrollObbyTrollButton = pc.createScript('trollObbyTrollButton');

TrollObbyTrollButton.attributes.add("toggleEntity", {type:"entity"});

// initialize code called once per entity
TrollObbyTrollButton.prototype.initialize = function() {

    this.id = "trollButton" + this.getRandomId();
    this.serverId = this.id + "Server";
    this.trapId = this.id + "trap";

    this.entity.script.trollObbyTrigger.fireName = this.id;
    this.entity.script.trollObbyTrigger.tags = ["Player"];

    this.app.on(this.id, this.onTrigger, this);
    this.app.on(this.serverId, this.onServerTrigger, this);

    this.on('destroy', function () {
        this.app.off(this.id);
        this.app.off(this.serverId);
        this.app.off(this.trapId);
    }, this);

    this.active = false;
    this.pos0 = this.entity.getLocalPosition().clone();
    this.pos1 = this.entity.getLocalPosition().clone().add(new pc.Vec3(0,-.3,0));

    this.trapArea = this.entity.parent.findByName("TrapArea");
    this.trapArea.script.trollObbyTrigger.fireName = this.trapId;
    this.app.on(this.trapId, this.onTrapTrigger, this);

    this.trollerId = null;

    this.state = new StateSystem;

    this.state.add("idle");

    this.state.add("press", {
        onStart: ()=>{
            this.toggleEntity.enabled = false;
            this.playButtonAnim();

            let mat = this.app.trollObbyNetworkManager.buttonMats[1]
            this.entity.render.meshInstances[0].material = mat.resource;
        },

        onEnd: ()=>{
            //this.app.trollObbyNetworkManager.buttonMats[0]
            let mat = this.app.trollObbyNetworkManager.buttonMats[0]
            this.entity.render.meshInstances[0].material = mat.resource;
        },
    });
};

TrollObbyTrollButton.prototype.onTrapTrigger = function(){
    console.log("trap");

    if (this.toggleEntity.enabled){return;}
    if (this.trollerId && this.trollerId != this.app.trollObbyNetworkManager.room.sessionId){
        console.log("troller id found")
        this.app.trollObbyNetworkManager.room.send("Client:SpawnEdit", { targetSessionId: this.trollerId, attacker: false});
    } else {
        let trollerId = this.app.trollObbyPlayerController.getNearestPlayer(this.entity.getPosition(), true);
        if (trollerId && this.app.trollObbyNetworkManager.room){
            this.app.trollObbyNetworkManager.room.send("Client:SpawnEdit", { targetSessionId: trollerId.id, attacker: false});
        };
        console.log("troller id not found")
    }
}

TrollObbyTrollButton.prototype.playButtonAnim = function(){
    let code = this;
    this.entity
        .tween(this.entity.getLocalPosition())
        .to(this.pos1, 0.3, pc.SineOut)
        .onComplete(() => {

            this.entity
                .tween(this.entity.getLocalPosition())
                .to(this.pos0, 0.3, pc.SineIn)
                .onComplete(() => {
                    setTimeout(()=>{
                        this.toggleEntity.enabled = true;

                        setTimeout(()=>{
                            code.state.set("idle");
                        }, 3*1000);
                    }, 3*1000);


                })
                .start();

        })
        .start();
}

TrollObbyTrollButton.prototype.onTrigger = function () {
    if (this.app.trollObbyNetworkManager.room){
        this.app.trollObbyNetworkManager.room.send("Client:ToggleButton", {buttonId: this.serverId});
    }
};

TrollObbyTrollButton.prototype.onServerTrigger = function(_trollerId){
    if (this.state.state == "idle"){
        this.state.set("press");
    }

    this.trollerId = _trollerId;
}

TrollObbyTrollButton.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};
