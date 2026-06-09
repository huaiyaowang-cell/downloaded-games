var TrollObbyBee = pc.createScript('trollObbyBee');

// initialize code called once per entity
TrollObbyBee.prototype.initialize = function() {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;


    this.player = this.app.root.findByName("Player")
    this.model = this.entity.findByName("Model");
    this.state = new StateSystem;
    this.state.autoStart = false;

    this.defRotation = this.entity.getRotation().clone();
    this.defPosition = this.entity.getPosition().clone();
    this.hitDirection = pc.Vec3.ZERO;

    this.targetQuat = new pc.Quat();
    this.lerpSpeed = 5;

    this.moveSpeedNormal = 5.0;
    this.moveSpeedReturn = 10.0;
    this.alertRadius = 15.0;
    this.attackRadius = 1.5;
    this.alertTime = 1.0;

    this.moveSpeed = this.moveSpeedNormal;

    this.faceNormal = this.entity.findByName("Bee_Neutral");
    this.faceAngry = this.entity.findByName("Bee_Angry");
    this.anim = this.entity.findByName("BeeArmature").anim;

    if (!this.app.bees) {
        this.app.bees = {};
    }
    this.id = "bee"+this.getRandomId();
    this.app.bees[this.id] = this;

    this.isFrozen = false;
    this.app.on("bee:setFrozen", this.setFrozen, this);

    this.state.add("idle", {
        onUpdate: (dt)=> {
            if (this.entity.getPosition().distance(this.player.getPosition()) <= this.alertRadius && !this.app.inCannon){
                this.state.set("alerted")
            }

            this.targetQuat = this.defRotation.clone();
        },

        onStart: ()=>{
            this.faceNormal.enabled = true;
            this.faceAngry.enabled = false;
            this.model.fire("Motion", "idle");
        },

        onEnd: ()=>{
            this.model.fire("Motion:Stop", "idle");
        }
    });

    this.state.add("alerted", {
        onUpdate: (dt)=> {
            this.look(this.player.getPosition());
            if (this.entity.getPosition().distance(this.player.getPosition()) > this.alertRadius || this.app.inCannon){
                this.state.set("idle")
            }

            if (this.state.hit(this.alertTime)){
                this.state.set("chase")
            };
        },

        onStart: ()=>{
            this.faceNormal.enabled = false;
            this.faceAngry.enabled = true;
        },

    });

    this.state.add("chase", {
        onUpdate: (dt)=> {
            this.look(this.player.getPosition());
            this.move(dt);

            if (this.entity.getPosition().distance(this.player.getPosition()) > this.alertRadius || this.app.inCannon){
                this.state.set("return");
            }

            if (this.entity.getPosition().distance(this.player.getPosition()) < this.attackRadius){
                this.state.set("attack");
            }
        },

        onStart: ()=>{
            this.model.fire("Motion", "shake");
            console.log("chase");
            this.anim.setBoolean("rage", true);
        },

        onEnd: ()=>{
            this.model.fire("Motion:Stop", "shake");
            this.anim.setBoolean("rage", false);
        }
    });

    this.state.add("attack", {
        onUpdate:()=>{
            this.look(this.player.getPosition());
        },

        onStart:()=>{
            let entityPos = this.entity.getPosition();
            let playerPos = this.player.getPosition();

            let _dir = new pc.Vec3();
            _dir.sub2(playerPos, entityPos).normalize();

            let upAim = 0.4;
            let aimedForward = this.entity.forward.clone().add(new pc.Vec3(0, upAim, 0)).normalize();
            let _force = aimedForward.scale(6);

            this.app.trollObbyPlayerController.roll(true, _force, _dir);

            setTimeout(()=>{
                this.app.auraManager.edit({
                    type: "bee",
                    id: this.id,
                }, false, false);
                this.state.set("freeze_attacker");
            }, this.app.auraManager.editDelay * 1000);
        },
    })

    this.state.add("return", {
        onUpdate: (dt)=> {
            this.look(this.defPosition);
            this.move(dt);

            if (this.entity.getPosition().distance(this.defPosition) < 1.5){
                this.state.set("idle");
            }
        },

        onStart: ()=>{
            this.faceNormal.enabled = true;
            this.faceAngry.enabled = false;

            //console.log("distance", this.entity.getPosition().distance(this.defPosition));

            if (this.entity.getPosition().distance(this.defPosition) > 50){
                this.entity.setPosition(this.defPosition);
                this.state.set("idle");
            } else {
                this.moveSpeed = this.moveSpeedReturn;
            }
        },

        onEnd: ()=>{
            this.moveSpeed = this.moveSpeedNormal;  
        }
    });

    this.state.add("knockback_pre", {
        onUpdate: (dt)=> {
            if (this.state.hit(this.app.auraManager.editDelay)){
                this.state.set("freeze_target");
            }
        },

        onStart: ()=>{
            this.entity.rigidbody.enabled = true;
            this.entity.rigidbody.applyImpulse(this.hitDirection.clone().mulScalar(40));
            this.entity.rigidbody.applyTorqueImpulse(this.hitDirection.clone().mulScalar(2));
        },

        onEnd: ()=>{
            this.entity.rigidbody.enabled = false;
        }
    });

    this.state.add("knockback", {
        onUpdate: (dt)=> {
            if (this.state.hit(2)){
                this.state.set("return");
            }
        },

        onStart: ()=>{
            this.entity.rigidbody.enabled = true;
            this.entity.rigidbody.applyImpulse(this.hitDirection.clone().mulScalar(20));
            this.entity.rigidbody.applyTorqueImpulse(this.hitDirection.clone().mulScalar(2));
        },

        onEnd: ()=>{
            this.entity.rigidbody.enabled = false;
        }
    });

    this.state.add("freeze_target", {
        onUpdate: ()=>{
            if (this.state.hit(this.app.auraManager.editDuration-.2)){
                this.state.set("knockback");
            };
        },

        onStart: ()=>{
            this.anim.enabled = false;
        },

        onEnd: ()=>{
            this.anim.enabled = true;
        },
    })

    this.state.add("freeze_attacker", {
        onUpdate: ()=>{
            if (this.state.hit(this.app.auraManager.editDuration)){
                this.state.set("return");

                setTimeout(()=>{
                    this.app.trollObbyPlayerController.roll(false);
                }, 1.5 * 1000);
            };
        },

        onStart: ()=>{
            this.anim.enabled = false;
        },

        onEnd: ()=>{
            this.anim.enabled = true;
        },
    })

    setTimeout(()=>{this.state.set("idle");}, 500)
};

// update code called every frame
TrollObbyBee.prototype.update = function(dt) {

    if (this.isFrozen == false){
        this.state.update(dt);
        
        if (this.state.state != "freeze_target"){
            let currentQuat = this.entity.getRotation().clone();
            currentQuat.slerp(currentQuat, this.targetQuat, dt * this.lerpSpeed);
            this.entity.setRotation(currentQuat);
        }
    }

};

TrollObbyBee.prototype.look = function(_position) {

    let rot = this.entity.getRotation().clone();

    this.entity.lookAt(_position);
    this.targetQuat.copy(this.entity.getRotation());

    this.entity.setRotation(rot);
}

TrollObbyBee.prototype.move = function(dt) {
    let forward = this.entity.forward.clone();
    forward.normalize();

    let move = forward.scale(this.moveSpeed * dt);
    this.entity.translate(move);
}

TrollObbyBee.prototype.setFrozen = function(_isFrozen, _ignoreID, _overrideClose = false){
    if (_overrideClose){
        this.isFrozen = false;
        this.anim.enabled = true;
    } else {
        if (_ignoreID != null && _ignoreID != this.id){
            this.isFrozen = _isFrozen;
        }
        this.anim.enabled = (_isFrozen == false);
    }
}


TrollObbyBee.prototype.hit = function(direction){
    this.hitDirection = direction;
    this.state.set("knockback_pre");

    this.app.auraManager.edit({
        type: "bee",
        id: this.id,
    }, true, false);
}

TrollObbyBee.prototype.setTrollFace = function(role){
    if (!role || role == null){
        this.entity.findByName("FaceAttacker").enabled = false;
        this.entity.findByName("FaceTarget").enabled = false;
    }

    if (role == "attacker"){
        this.entity.findByName("FaceAttacker").enabled = true;
        this.entity.findByName("FaceTarget").enabled = false;
    }

    if (role == "target"){
        this.entity.findByName("FaceAttacker").enabled = false;
        this.entity.findByName("FaceTarget").enabled = true;
    }
}

TrollObbyBee.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};

