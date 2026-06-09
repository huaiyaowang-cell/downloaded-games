var TrollObbyMigato = pc.createScript('trollObbyMigato');

TrollObbyMigato.prototype.initialize = function() {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this.cage = this.entity.findByName("Cage");
    this.key = this.entity.findByName("Key");
    this.sitPoint = this.entity.findByName("SitPoint");
    this.cat = this.entity.findByName("Cat");

    this.pos0 = new pc.Vec3(0,0,0);
    this.pos1 = this.entity.findByName("EndPoint").getLocalPosition().clone();

    this.idKey = "MigatoKey" + this.getRandomId();
    this.idCat = "MigatoCat" + this.getRandomId();

    this.keyTrigger = this.entity.findByName("KeyTrigger").script.trollObbyTrigger;
    this.catTrigger = this.entity.findByName("CatTrigger").script.trollObbyTrigger;

    this.keyTrigger.fireName = this.idKey;
    this.catTrigger.fireName = this.idCat;

    this.app.on(this.idKey, this.onKeyTrigger, this);
    this.app.on(this.idCat, this.onCatTrigger, this);

    this.on('destroy', function () {
        this.app.off(this.idKey);
        this.app.off(this.idCat);
    }, this);

    this.rideable = false;
    this.app.onMigato = false;
};


TrollObbyMigato.prototype.onKeyTrigger = function(){
    this.key.enabled = false;
    this.cage.enabled = false;
    this.rideable = true;
}

TrollObbyMigato.prototype.onCatTrigger = function(){
    if (this.rideable){this.rideable = false} else {return;}

    this.app.trollObbyNetworkManager.room.send("Client:Attackable", { attackable: false});

    let player = this.app.root.findByName("Player");
    player.rigidbody.linearVelocity = pc.Vec3.ZERO;
    player.rigidbody.enabled = false;
    player.setPosition(this.sitPoint.getPosition());
    this.app.onMigato = true;
    this.app.trollObbyPlayerController._animComponent.setBoolean("sitting", true);

    // ileri

    let code = this;

    this.cat
        .tween(this.cat.getLocalPosition())
        .to(this.pos1, 3, pc.SineInOut)
        .onUpdate(()=>{
            player.setPosition(code.sitPoint.getPosition());
        })
        .onComplete(() => {

            setTimeout(()=>{
                let player = this.app.root.findByName("Player");
                player.rigidbody.enabled = true;
                player.setLocalScale(pc.Vec3.ONE);
                this.app.onMigato = false;
                this.app.playerBounce.bounce(this.app.root.up, 2, .5);
                this.app.trollObbyPlayerController._animComponent.setBoolean("sitting", false);
            }, 500);

            // geri
            setTimeout(()=>{
                this.cat
                    .tween(this.cat.getLocalPosition())
                    .to(this.pos0, 3, pc.SineInOut)
                    .onComplete(() => {
                        this.rideable = true;
                    })
                    .start();

            }, 3 * 1000);

        })
        .start();
};

TrollObbyMigato.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
}