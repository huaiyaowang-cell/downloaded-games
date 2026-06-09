var TrollObbyCartSpawner = pc.createScript('trollObbyCartSpawner');


TrollObbyCartSpawner.attributes.add('splineIndex', {type: 'number', description: 'Spline Index'});

// initialize code called once per entity
TrollObbyCartSpawner.prototype.initialize = function() {
    this.cartManager = this.app.root.findByName("CartManager").script.trollObbyCartManager;
    this.spawn = this.entity.findByName("Spawn");

    this.id = "spawner" + this.getRandomId();

    this.trigger = this.entity.findByName("Trigger");
    this.trigger.script.trollObbyTrigger.fireName = this.id;
    this.trigger.script.trollObbyTrigger.shouldReplicate = false;
    this.trigger.script.trollObbyTrigger.print = true;
    this.trigger.script.trollObbyTrigger.tags = ["Player"];
    this.app.on(this.id, this.onTrigger, this);

    this.on('destroy', function () {
        this.app.off(this.id);
    }, this);
};


TrollObbyCartSpawner.prototype.onTrigger = function(){
    this.cartManager.createCart(this.spawn.getPosition(), this.splineIndex);
    this.app.lastSpline = this.splineIndex;
}


TrollObbyCartSpawner.prototype.getRandomId = function(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}


