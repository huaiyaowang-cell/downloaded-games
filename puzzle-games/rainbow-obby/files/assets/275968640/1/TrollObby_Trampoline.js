var TrollObbyTrampoline = pc.createScript('trollObbyTrampoline');

TrollObbyTrampoline.attributes.add("power", {type:"number", default:1});

// initialize code called once per entity
TrollObbyTrampoline.prototype.initialize = function() {
    this.trigger = this.entity.findByName("Trigger");
    this.direction = this.entity.findByName("Cone").up;
    this.base = this.entity.findByName("Base");

    this.id = this.getRandomId();
    this.trigger.script.trollObbyTrigger.fireName = this.id;
    this.trigger.script.trollObbyTrigger.tags = ["Player"];

    this.app.on(this.id, ()=>{
        this.app.playerBounce.bounce(this.direction, this.power);
        this.squish();
    }, this)

    this.on('destroy', function () {
        this.app.off(this.id);
    }, this);
};

TrollObbyTrampoline.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
};

TrollObbyTrampoline.prototype.squish = function () {
    // İlk tween: 1 -> 1.25
    this.base.tween(this.base.getLocalScale())
        .to({ x: 1.25, y: 1.25, z: 1.25 }, 0.15, pc.SineOut)
        .start()
        .onComplete(()=> {

            // İkinci tween: 1.25 -> 1
            this.base.tween(this.base.getLocalScale())
                .to({ x: 1, y: 1, z: 1 }, 0.15, pc.SineIn)
                .start();

        });
};

