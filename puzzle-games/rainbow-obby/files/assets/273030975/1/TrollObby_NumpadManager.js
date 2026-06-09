var TrollObbyNumpadManager = pc.createScript('trollObbyNumpadManager');

TrollObbyNumpadManager.attributes.add("numbersParent", {type:"entity"});
TrollObbyNumpadManager.attributes.add("displayText", {type:"entity"});
TrollObbyNumpadManager.attributes.add("body", {type:"entity"});

// initialize code called once per entity
TrollObbyNumpadManager.prototype.initialize = function() {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;
    this.app.numpadManager = this;

    let children = this.numbersParent.children;

    for (let i = 0; i < children.length; i++) {
        let textEntity = children[i].children[0];
        if (!textEntity || !textEntity.element) continue;
        let number = (i === 9) ? 0 : i + 1;
        textEntity.element.text = number;

        children[i].button.on("click", function(event){
            let number = (i === 9) ? "0" : `${i+1}`;
            this.app.numpadManager.addDigit(number);
        }, this);
    }

    this.menuCloseButton = this.entity.findByName("NumpadCloseButton");
    this.menuCloseButton.button.on('click', function (event) {
        this.close();
    }, this);

    this.goButton = this.entity.findByName("GoButton");
    this.goButton.button.on('click', function (event) {
        this.check();
    }, this);

    this.resetButton = this.entity.findByName("ResetButton");
    this.resetButton.button.on('click', function (event) {
        this.reset();
    }, this);

    this.app.numpad = {
        enabled: false,
        password: "",
        fireName: "",
        shouldReplicate: false,
    };
};

TrollObbyNumpadManager.prototype.open = function(password, fireName, shouldReplicate){
    this.app.numpad.enabled = true;
    this.app.numpad.password = password;
    this.app.numpad.fireName = fireName;
    this.app.numpad.shouldReplicate = shouldReplicate;
    this.app.fire("lockCamera", true);
    this.networkManager.setBlackBG(true);
    this.body.enabled = true;

    this.entity.findByName("DisplayText").element.text = "";
}

TrollObbyNumpadManager.prototype.close = function(){
    this.app.numpad.enabled = false;
    this.app.fire("lockCamera", false);
    this.networkManager.setBlackBG(false);
    this.body.enabled = false;
}

TrollObbyNumpadManager.prototype.check = function(){
    let displayText = this.entity.findByName("DisplayText").element;

    if (displayText.text == this.app.numpad.password){
        console.log("password correct");
        this.networkManager.fire(this.app.numpad.fireName, this.app.numpad.shouldReplicate)
        this.close();
        this.app.fire("WarningTextController:setWarning", "Answer is correct", null, new pc.Color(0, 1, 0, 1));
    } else {
        this.app.fire("WarningTextController:setWarning", "Answer is wrong", null, new pc.Color(1, 0, 0, 1));
        this.close();
    };
}

TrollObbyNumpadManager.prototype.reset = function(){
    this.entity.findByName("DisplayText").element.text = '';
}

TrollObbyNumpadManager.prototype.addDigit = function(digitAsString){
    let displayText = this.entity.findByName("DisplayText").element;
    if (displayText.text.length < 6){
        displayText.text = displayText.text + digitAsString;
    };
}
