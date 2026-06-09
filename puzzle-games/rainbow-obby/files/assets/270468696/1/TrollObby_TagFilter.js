var TrollObbyTagFilter = pc.createScript('trollObbyTagFilter');

TrollObbyTagFilter.attributes.add("ignoreTags", {
    type: "string",
    array: true,
    title: "Ignore Tags"
});
TrollObbyTagFilter.attributes.add("private", { type: "boolean" });

TrollObbyTagFilter.prototype.initialize = function () {
    this.app.on("Respawned", this.initFilter, this);
    this.initFilter();

    //this.entity.rigidbody.enabled = true;

    //console.log("name", this.entity.name);
};


var IGNORE_GROUP = pc.BODYGROUP_USER_4;

TrollObbyTagFilter.prototype.setDisabled = function (entity) {
    if (!entity || !entity.rigidbody) return;

    entity.rigidbody.group = IGNORE_GROUP;
    this.entity.rigidbody.mask &= ~IGNORE_GROUP;
};

TrollObbyTagFilter.prototype.initFilter = function () {
    if (!this.private)
        this.app.on("DisabledCollision", this.setDisabled, this);

    // Tüm entitileri gez → tag eşleşenleri ignorela
    let all = this.app.root.findComponents("rigidbody"); 

    for (let i = 0; i < all.length; i++) {
        let ent = all[i].entity;

        for (let t = 0; t < this.ignoreTags.length; t++) {
            if (ent.tags.has(this.ignoreTags[t])) {
                this.setDisabled(ent);
                //console.log("disabled with", ent.name);
                break;
            }
        }
    }

    this.entity.on("destroy", () => {
        this.app.off("DisabledCollision", this.setDisabled, this);
        this.app.off("Respawned", this.initFilter, this);
    });
};
