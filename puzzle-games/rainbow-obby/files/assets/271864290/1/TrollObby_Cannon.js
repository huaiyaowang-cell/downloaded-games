var TrollObbyCannon = pc.createScript('trollObbyCannon');

TrollObbyCannon.attributes.add('explosionEffect', { type: 'asset' });
TrollObbyCannon.attributes.add('launchPower', { type: 'number', default: 4 });

// initialize code called once per entity
TrollObbyCannon.prototype.initialize = function () {
    this.trigger = this.entity.findByName("Trigger");
    this.point = this.entity.findByName("Point");
    this.movingPart = this.entity.findByName("MovingPart");

    this.id = "cannon" + this.getRandomId();
    this.trigger.script.trollObbyTrigger.fireName = this.id;
    this.trigger.script.trollObbyTrigger.tags = ["Player"];

    this.app.on(this.id, this.onTrigger, this);

    this.aiming = false;
    this.camera = this.app.root.findByName("Camera");
    this.direction = this.entity.findByName("Direction");

    this.on('destroy', function () {
        this.app.off(this.id);
    }, this);

    this.canEnter = true;
    this.app.inCannon = false;
};


TrollObbyCannon.prototype.onTrigger = function () {
    if (this.canEnter) { this.canEnter = false; } else { return; };
    let player = this.app.root.findByName("Player");
    this.aiming = true;

    player.rigidbody.linearVelocity = pc.Vec3.ZERO;
    player.rigidbody.enabled = false;
    //player.reparent(this.point);
    player.setPosition(this.point.getPosition());
    this.app.inCannon = true;
    //player.setLocalScale(pc.Vec3.ONE);
    //player.setLocalEulerAngles(0,0,0);

    setTimeout(() => {
        let player = this.app.root.findByName("Player");
        player.rigidbody.enabled = true;
        //player.reparent(this.app.root);
        //player.setLocalPosition(pc.Vec3.ZERO);
        player.setLocalScale(pc.Vec3.ONE);
        //player.setLocalRotation(new pc.Quat());

        /*         setTimeout(()=>{
                    let player = this.app.root.findByName("Player");
                    player.setLocalEulerAngles(0,0,0);
                }, 1000); */

        this.app.playerBounce.bounce(this.direction.up, this.launchPower, 1);
        this.aiming = false;
        this.app.inCannon = false;

        this.exploded = true;
        let asset = this.explosionEffect
        if (asset && asset.resource) {
            let instance = asset.resource.instantiate();
            let pos = this.entity.getPosition()
            instance.setPosition(pos);
            this.app.root.addChild(instance);
        }

        /*         setTimeout(()=>{
                    player.setLocalRotation(0, 0, 0, 0);
                }, 500); */

        setTimeout(() => {
            this.canEnter = true;
        }, 1000);

    }, 2 * 1000);
}

TrollObbyCannon.prototype.update = function () {
    /*     if (this.aiming){
            //this.movingPart.setLocalEulerAngles(this.camera.getEulerAngles().clone().add(new pc.Vec3(0,0,-45)));
    
            if (this.app.mouse.isPressed(pc.MOUSEBUTTON_LEFT)){
    
                let player = this.app.root.findByName("Player");
                player.rigidbody.enabled = true;
                player.reparent(this.app.root);
                player.setLocalPosition(pc.Vec3.ZERO);
                player.setLocalScale(pc.Vec3.ONE);
                player.setLocalEulerAngles(0,0,0);
    
                this.app.playerBounce.bounce(this.direction.up, 6, 1);
                this.aiming = false;
    
                setTimeout(()=>{
                    player.setLocalRotation(0, 0, 0, 0);
                }, 500);
            }
        } */
}


TrollObbyCannon.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};
