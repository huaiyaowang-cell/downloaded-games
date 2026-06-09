var TrollObbyMathDoor = pc.createScript('trollObbyMathDoor');

// initialize code called once per entity
TrollObbyMathDoor.prototype.initialize = function () {
    this.networkManager = this.app.root.findByName("NetworkManager").script.trollObbyNetworkManager;

    this.tweenTime = 1;
    this.recloseTime = 12;

    this.doorLeft = this.entity.findByName("DoorLeft");
    this.doorRight = this.entity.findByName("DoorRight");

    this.id = "MathDoor" + this.getRandomId();
    this.serverId = this.id + "Server";

    this.button = this.entity.findByName("Button").script.trollObbyButton;

    setTimeout(() => { this.button.setup(this.id, false, true); }, 500);

    this.app.on(this.id, this.onTrigger, this);
    this.app.on(this.serverId, this.open, this);
    this.isOpen = false;

    this.on('destroy', function () {
        this.app.off(this.id);
        this.app.off(this.serverId);
    }, this);

    this.math = {
        currentIndex: 0,
        questions: [
            // Kolay
            ["5 X 3 = ?", "15"],
            ["13 - 4 = ?", "9"],
            ["9 + 6 = ?", "15"],
            ["18 / 3 = ?", "6"],
            ["4 X 3 = ?", "12"],
            ["20 - 12 = ?", "8"],

            // Orta
            /*             ["12 + 19 = ?", "31"],
                        ["25 - 9 = ?", "16"],
                        ["7 X 9 = ?", "63"],
                        ["36 / 4 = ?", "9"],
                        ["15 X 6 = ?", "90"],
                        ["42 - 17 = ?", "25"], */

            // Bir tık zor
            /*            ["28 + 17 = ?", "45"],
                       ["64 - 29 = ?", "35"],
                       ["14 X 8 = ?", "112"],
                       ["81 / 9 = ?", "9"],
                       ["6 X 15 = ?", "90"],
                       ["72 / 8 = ?", "9"], */

            // Kafa çalıştıran ama abartı değil
            /*          ["125 - 47 = ?", "78"],
                     ["24 X 7 = ?", "168"],
                     ["96 / 6 = ?", "16"],
                     ["39 + 28 = ?", "67"],
                     ["18 X 9 = ?", "162"],
                     ["144 / 12 = ?", "12"] */
        ],
    }

    this.loadRandomQuestion();
};

TrollObbyMathDoor.prototype.open = function () {

    this.loadRandomQuestion();

    this.app.fire("Motion", "DoorLeft");
    this.app.fire("Motion", "DoorRight");

    this.entity.sound.play("open");

    this.isOpen = true;

    setTimeout(() => {
        this.close();
        this.isOpen = false;
    }, this.recloseTime * 1000)

    // Sol kapı sola (-2)
    this.doorLeft
        .tween(this.doorLeft.getLocalPosition())
        .to({ x: 3 }, this.tweenTime, pc.SineIn)   // curved easing
        .onComplete(() => {
            this.app.fire("Motion:Stop", "DoorLeft");
        })
        .start();

    // Sağ kapı sağa (+2)
    this.doorRight
        .tween(this.doorRight.getLocalPosition())
        .to({ x: -3 }, this.tweenTime, pc.SineIn)
        .onComplete(() => {
            this.app.fire("Motion:Stop", "DoorRight");
        })
        .start();
};

TrollObbyMathDoor.prototype.onTrigger = function () {
    if (this.app.gameplayStarted) {
        this.app.gameplayStarted = false
        PokiSDK.gameplayStop();
    }
    this.app.numpadManager.open(this.math.questions[this.math.currentIndex][1], this.serverId, true);
}

TrollObbyMathDoor.prototype.close = function () {
    this.app.fire("Motion", "DoorLeft");
    this.app.fire("Motion", "DoorRight");

    this.entity.sound.play("close");

    // Sol kapıyı x = 0
    this.doorLeft
        .tween(this.doorLeft.getLocalPosition())
        .to({ x: 0 }, this.tweenTime, pc.SineIn)
        .onComplete(() => {
            this.app.fire("Motion:Stop", "DoorLeft");
        })
        .start();

    // Sağ kapıyı x = 0
    this.doorRight
        .tween(this.doorRight.getLocalPosition())
        .to({ x: 0 }, this.tweenTime, pc.SineIn)
        .onComplete(() => {
            this.app.fire("Motion:Stop", "DoorRight");
        })
        .start();
};


TrollObbyMathDoor.prototype.getRandomId = function () {
    let pos = this.entity.getPosition();

    let x = Math.round(pos.x);
    let y = Math.round(pos.y);
    let z = Math.round(pos.z);

    return `${x}_${y}_${z}`;
}

TrollObbyMathDoor.prototype.loadRandomQuestion = function () {
    let index = Math.floor(Math.random() * this.math.questions.length)
    let question = this.math.questions[index][0];

    this.math.currentIndex = index;
    this.entity.findByName("MathText").element.text = question;

}






