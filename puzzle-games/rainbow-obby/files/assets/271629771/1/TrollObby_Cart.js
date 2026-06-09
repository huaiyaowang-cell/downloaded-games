var TrollObbyCart = pc.createScript('trollObbyCart');

TrollObbyCart.attributes.add('moveForce', { type: 'number', default: 20 });
TrollObbyCart.attributes.add('maxSpeed', { type: 'number', default: 10 });
TrollObbyCart.attributes.add('explosionEffect', { type: 'asset' });

 
// initialize code called once per entity
TrollObbyCart.prototype.initialize = function() {
    this.model = this.entity.findByName("Model");
    this.collider = this.entity.findByName("Collider");
    this.mount = this.entity.findByName("Mount");
    this.playerPoint = this.entity.findByName("SitPosition");
    this.body = this.entity.findByName("Body");
    this.player = null;
    this.cameraPosition = this.entity.findByName("CameraPosition");
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;
    this.isOnline = this.networkManager.room != null;
    this.camera = this.app.root.findByName('Camera');

    if (this.isOnline){this.isLocal = this.networkManager.room.sessionId == this.cartData.ownerId;} else {this.isLocal = true;}

    this.speedText = this.entity.findByName("SpeedText");

    this.rideable = false;
    this.leaveable = false;
    this.shouldUpdateLastValue = true;
    setTimeout(()=>{this.shouldUpdateLastValue = false}, 2000)

    this.moveForce = 50
    this.maxSpeed = 200
    this.spline = this.app.splines[this.cartData.splineIndex];
    this.speedMul = 1;

    
    //console.log("speedMul", this.speedMul);

    this.entity.findByName("Mount").collision.on("triggerenter", (otherEntity)=>{
        if (otherEntity.tags.has("Player") && this.isLocal && this.rideable){
            this.onEnter(otherEntity);
        }
    })

    this.collider.rigidbody.linearVelocity = pc.Vec3.ZERO;
    this.collider.rigidbody.enabled = true;
    this.mount.collision.enabled = false;
    
    
    if (this.isLocal){
        this.mount.collision.enabled = true;
        this.rideable = true;
        this.collider.tags.add("Local");
        this.collider.tags.add("LocalCollider");
        this.app.localCartId = this.cartData.id;
        //console.log("this.app.localCartId = this.cartData.id;")
        this.app.rotOverrider = null;

        if (this.app.shouldAutoGetIn){
            this.app.shouldAutoGetIn = false;
            setTimeout(()=>{
                let player = this.app.root.findByName("Player");
                this.onEnter(player);
            }, 100)
        }
    } else {
        this.collider.tags.add("Ground");
        this.speedText.destroy();
        this.collider.tags.add("Remote");
        this.collider.tags.add("RemoteCollider");
        this.collider.rigidbody.type = "kinematic";
    }

    this.moveDir = 0;
    this.targetPosition = null;

    this.lerpRotation = new pc.Quat();
    this.lastValue = 0;

    this.collidingGround = false;
    this.offRailTimer = 0;
    this.isDieFired = false;
    this.volumeLerp = 0;
};

TrollObbyCart.prototype.destroyCart = function(){
    if (this.front != null){
        this.expoEffect();

        if (this.player){
            if (this.isLocal){this.player.script.cartObbyPlayerController.destroyCart();}
        }
        else {this.app.cartObbyCartManager.removeCart(this.cartData.id)}
        this.collider.sound.play("destroy")
        if (this.isLocal){this.app.localCartId = null; console.log("this.app.localCartId = null")}
    }
}


TrollObbyCart.prototype.expoEffect = function(){
    let asset = this.explosionEffect
    if (asset && asset.resource) {
        let instance = asset.resource.instantiate();
        let pos = this.entity.getPosition()
        instance.setPosition(pos);
        this.app.root.addChild(instance);
    }
}

// update code called every frame
TrollObbyCart.prototype.update = function(dt) {

    //console.log(this.touchingRails.size)

    if (this.isLocal){
        this.speedText.element.text = Math.floor(this.collider.rigidbody.linearVelocity.length() / 30 * 100);

        if (this.player){
            let forward = 0;
            let backward = 0;

            joystick = window.touchJoypad.sticks['joystick0'];

            if (!this.app.menuPanelEnabled && !this.app.isMarketEnabled){
                if (this.app.isMobile) {
                    if (joystick.y > 0) {
                        forward = 1;
                    } else if (joystick.y < 0) {
                        backward = 1;
                    }
                } else {
                    forward = (this.app.keyboard.isPressed(pc.KEY_W) || this.app.keyboard.isPressed(pc.KEY_UP))
                    backward = (this.app.keyboard.isPressed(pc.KEY_S) || this.app.keyboard.isPressed(pc.KEY_DOWN))
                }
            }
            let move = (forward - backward) * 1;

            if (move !== 0 && this.camera) {
                let rb = this.collider.rigidbody;
                //let camForward = this.camera.forward.clone();
                //camForward.y = 0;
                //camForward.normalize();
                
                let dir = this.model.forward.clone().normalize();
                let currentSpeed = rb.linearVelocity.length();
                if (currentSpeed < this.maxSpeed) {
                    let force = dir.scale(this.moveForce * move * this.speedMul);
                    rb.applyForce(force);
                }
            }
        }

        if (this.isOnline && this.networkManager.room.connection.isOpen === true){
            this.networkManager.room.send("Client:CartPosition", {
                id: this.cartData.id,
                x: this.collider.getPosition().x,
                y: this.collider.getPosition().y,
                z: this.collider.getPosition().z,
            });
        }
    } else if (this.targetPosition != null){
        let _position = this.collider.getPosition().clone();
        _position.lerp(_position, this.targetPosition, dt * 5);
        this.collider.setPosition(_position);
    }


    if (this.collider.rigidbody.linearVelocity.length() !== 0) {
        if (!this.collider.sound.isPlaying("drive")) {this.collider.sound.play("drive");}
    } else {this.collider.sound.stop("drive");}

    let speed = this.collider.rigidbody.linearVelocity.length();
    let ratio = speed / this.maxSpeed;
    let volume = Math.min(ratio*10, 1);
    let pitch = Math.max(Math.min(ratio*15, 2),1) * this.collidingGround;
    let slot = this.collider.sound.slot("drive") 
    this.volumeLerp = pc.math.lerp(this.volumeLerp, volume, .2);
    slot.volume = this.volumeLerp;
    slot.pitch = pitch

    let value = this.spline.getValue(this.collider.getPosition(), this.lastValue);
    
    if (this.collidingGround || this.shouldUpdateLastValue){this.lastValue = value;}

    let _rot = 0;
    if (this.app.rotOverrider){_rot = this.app.rotOverrider.getRotation();}
    else {_rot = this.spline.getRotation(value);}
    this.lerpRotation.slerp(this.lerpRotation, _rot, .2);

    this.model.setRotation(this.lerpRotation);
    this.model.setPosition(this.collider.getPosition());

    this.collidingGround = (this.spline.distance < 25);
    
    if (!this.collidingGround && this.isLocal && this.player){
        this.offRailTimer+=dt;
        if (this.offRailTimer >= 1 && !this.isDieFired && (this.app.rotOverrider == null)){
            this.isDieFired = true;
            this.app.fire("playerDie");
        }
    } else {this.offRailTimer = 0;}
};

TrollObbyCart.prototype.onEnter = function(player, overrideValue = null, overridePosition = null){
    this.isDieFired = false;
    this.app.inCart = true;
    this.player = player;
    this.player.rigidbody.linearVelocity = pc.Vec3.ZERO;
    this.player.rigidbody.enabled = false;
    this.player.reparent(this.playerPoint);
    this.player.setLocalPosition(pc.Vec3.ZERO);
    this.player.setLocalScale(pc.Vec3.ONE);
    this.player.setLocalEulerAngles(0,0,0);
    this.player.script.trollObbyPlayerController.setCart(this);
    this.player.script.trollObbyPlayerController.setCamera();

    this.leaveable = false;
    setTimeout(()=>{this.leaveable = true}, 1 * 1000);

    if (overrideValue != null){
        this.shouldUpdateLastValue = true;
        setTimeout(()=>{this.shouldUpdateLastValue = false}, 2000)
        this.lastValue = overrideValue
        this.collider.rigidbody.teleport(this.spline.getPosition(overrideValue));
        this.collider.rigidbody.linearVelocity = pc.Vec3.ZERO;
        //this.collider.angularVelocity = pc.Vec3.ZERO;
    }

    if (overridePosition != null){
        this.shouldUpdateLastValue = true;
        setTimeout(()=>{this.shouldUpdateLastValue = false}, 2000)
        //this.lastValue = overrideValue
        this.collider.rigidbody.teleport(overridePosition);
        this.collider.rigidbody.linearVelocity = pc.Vec3.ZERO;
    }
}

TrollObbyCart.prototype.onExit = function(){
    this.app.inCart = false;
    this.player.rigidbody.linearVelocity = pc.Vec3.ZERO;
    this.player.rigidbody.enabled = true;
    this.player.reparent(this.app.root);
    //this.player.setLocalRotation(0,0,0,0);
    this.player.setLocalScale(pc.Vec3.ONE);
    this.player.script.trollObbyPlayerController.setCart(null);
    //this.player.script.cartObbyPlayerController.setCamera();
    this.player = null;

    this.rideable = false;
    this.mount.collision.enabled = false;
    setTimeout(()=>{
        if (this.mount && this.mount.collision){this.mount.collision.enabled = true;}
        this.rideable = true;
    }, 2 * 1000);

}

 
 