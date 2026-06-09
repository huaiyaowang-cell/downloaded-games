var TrollObbySmashWall = pc.createScript('trollObbySmashWall');

TrollObbySmashWall.attributes.add('wallTemplate', { type: 'asset' });

// initialize code called once per entity
TrollObbySmashWall.prototype.initialize = function() {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this.base = this.entity.findByName("Base");
    //this.label = this.entity.findByName("Text").element;

    this.id = "SmashWall" + this.getRandomId();
    this.serverId = this.id + "Server";

    this.app.on(this.id, this.onTrigger, this);
    //this.app.on(this.serverId, this.runElevator, this);

    this.on('destroy', function () {
        this.app.off(this.serverId);
        this.app.off(this.id);
    }, this);

    this.active = false;

    this.hitNow = 0;
    this.hitMax = 4;
};

TrollObbySmashWall.prototype.smash = function () {
    this.entity.findByName("Cracks").enabled = false;
    let children = this.entity.findByName("SmashWallPieces").children;

    for (let i = 0; i < children.length; i++) {
        let child = children[i];

        if (child.rigidbody) {
            child.rigidbody.type = "dynamic";
            let randomImpulse = new pc.Vec3(
                (Math.random() - 0.5) * 10,  // X
                Math.random() * 8 + 5,      // Y (biraz yukarı doğru)
                (Math.random() - 0.5) * 10   // Z
            );

            child.rigidbody.applyImpulse(randomImpulse);
        }
    }

    //this.label.text = "5";
    
    //setTimeout(()=>{this.label.text = "4";}, 1000);
    //setTimeout(()=>{this.label.text = "3";}, 2000);
    //setTimeout(()=>{this.label.text = "2";}, 3000);
    //setTimeout(()=>{this.label.text = "1";}, 4000);
    //setTimeout(()=>{this.label.text = "0";}, 5000);
    setTimeout(()=>{
        this.reset();
    }, 6 * 1000);
};

TrollObbySmashWall.prototype.reset = function(){
    //this.label.text = "Smash";
    this.entity.findByName("SmashWallPieces").destroy();

    let asset = this.wallTemplate
    if (asset && asset.resource) {
        let instance = asset.resource.instantiate();
        this.base.addChild(instance);
        let pos = new pc.Vec3(0,0,0);
        instance.setLocalPosition(pos);
    }

    this.entity.findByName("Cracks").enabled = true;
    this.hitNow = 0;
    this.setCracks(0);
}

TrollObbySmashWall.prototype.hit = function(){
    this.hitNow++;
    
    if (this.hitNow < this.hitMax){
        this.setCracks(this.hitNow);
        this.squish();
    } else if (this.hitNow == this.hitMax){
        this.smash();
        this.squish();
    }
}

TrollObbySmashWall.prototype.squish = function () {
    // İlk tween: 1 -> 1.25
    this.base.tween(this.base.getLocalScale())
        .to({ x: 1.1, y: 1.1, z: 1.1 }, 0.15, pc.SineOut)
        .start()
        .onComplete(()=> {

            // İkinci tween: 1.25 -> 1
            this.base.tween(this.base.getLocalScale())
                .to({ x: 1, y: 1, z: 1 }, 0.15, pc.SineIn)
                .start();

        });
};


TrollObbySmashWall.prototype.setCracks = function(number){
    let cracks = this.entity.findByName("Cracks").children;

    for (let i=0; i<cracks.length; i++){
        cracks[i].enabled = (i <= number);
    }
}

TrollObbySmashWall.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
}
