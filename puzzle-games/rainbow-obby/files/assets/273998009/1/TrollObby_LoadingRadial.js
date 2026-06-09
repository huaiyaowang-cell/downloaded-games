var TrollObbyLoadingRadial = pc.createScript('trollObbyLoadingRadial');

TrollObbyLoadingRadial.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this._element = this.entity.element;
    this._element.material = this._element.material.clone();

    if (this.fireName == null) this.fireName = "";
    if (this.shouldReplicate == null) this.shouldReplicate = false;
    if (this.shouldPrint == null) this.shouldPrint = false;

    this.state = new StateSystem;
    this.value = 0;
    this.setProgress(0);
    this.loadTime = 1.0;
    this._timeRate = 1/this.loadTime;

    this.state.add("idle", {
        onUpdate: (dt)=> {
            this.value = pc.math.clamp(this.value - (dt*this._timeRate), 0.0, 1.0);
            this.setProgress(this.value);
        },
    });

    this.state.add("loading", {
        onUpdate: (dt)=> {
            this.value = pc.math.clamp(this.value + (dt*this._timeRate), 0.0, 1.0);
            this.setProgress(this.value);

            if (this.value >= 1){
                this.state.set("completed");
            }
        },

    });

    this.state.add("completed", {
        onStart: ()=>{
            this.networkManager.fire(this.fireName, this.shouldReplicate, this.shouldPrint);
            this.value = 0;
            this.setProgress(0);
            this.state.set("idle");
        },
    });

    this.state.set("idle");
};


TrollObbyLoadingRadial.prototype.setProgress = function (value) {
    value = pc.math.clamp(value, 0.0, 1);

    this._progress = value;
    this._element.material.alphaTest = 1-value;
    this._element.material.update();
};


TrollObbyLoadingRadial.prototype.update = function (dt) {
    this.state.update(dt);
};

TrollObbyLoadingRadial.prototype.start = function(){
    this.state.set("loading");
}

TrollObbyLoadingRadial.prototype.stop = function(){
    this.state.set("idle");
}
