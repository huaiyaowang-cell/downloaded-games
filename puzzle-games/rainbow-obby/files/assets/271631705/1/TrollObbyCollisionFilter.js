var TrollObbyCollisionFilter = pc.createScript('trollObbyCollisionFilter');
//TrollObbyCollisionFilter.attributes.add("objects", { type: "entity", array: true, title: "Disabled Collision Entitys" })
TrollObbyCollisionFilter.attributes.add("objects", { type: "string", array: true, title: "Disabled Collision Entitys" })
TrollObbyCollisionFilter.attributes.add("private", { type: "boolean" })
//TrollObbyCollisionFilter.attributes.add("selfEntity", { type: "entity" })

// initialize code called once per entity
TrollObbyCollisionFilter.prototype.initialize = function () {
    if (this.entity.name == "Collider"){
        this.objects = [

        ]
    }

    this.app.on("Respawned", this.initFilter, this);
    this.initFilter();
};

var IGNORE_GROUP = pc.BODYGROUP_USER_4;

TrollObbyCollisionFilter.prototype.setDisabled = function (entity) {
    // 1) Parametre entity'yi ignore grubuna at
    entity.rigidbody.group = IGNORE_GROUP;

    // 2) Benim maskimden o grubu çıkar (artık o entity'ye çarpmam)
    this.entity.rigidbody.mask &= ~IGNORE_GROUP;

    //console.log("Disabled collision with:", entity.name);
};


TrollObbyCollisionFilter.prototype.initFilter = function(){
    if (!this.private)
        this.app.on("DisabledCollision", this.setDisabled, this);

    for (let i = 0; i < this.objects.length; i++) {
        let ent = this.app.root.findByName(this.objects[i])
        this.setDisabled(ent);
    }

    this.entity.on("destroy", () => {
        this.app.off("DisabledCollision", this.setDisabled, this);
        this.app.off("Respawned", this.initFilter, this);
    })
}