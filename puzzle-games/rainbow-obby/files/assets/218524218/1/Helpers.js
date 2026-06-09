/*Utils script that stores data to local storage if supported by Emre Şahin - emolingo games */
var Utils = {
    isLocalStorageSupported: function () {
        var isSupported = false;
        if (this.dataStore == null)
            this.dataStore = {};
        try {
            window.localStorage;
            isSupported = true;
        } catch (e) {
            isSupported = false;

        }
        return isSupported;
    },
    setItem: function (key, value) {
        if (this.isLocalStorageSupported()) {
            window.localStorage.setItem(key, value);
        } else {
            this.dataStore[key] = value;
        }
    },
    getItem: function (key) {
        if (this.isLocalStorageSupported()) {
            return window.localStorage.getItem(key);
        } else {
            return this.dataStore[key];
        }
    },
};

async function getUserFromSDK() {
    let userData;
    if (true) {
        try {
            console.log("Trying to get user");
            userData = await PokiSDK.getUser();
        } catch (error) {
            console.log("Get user failed:", error.message);
        }
    }
    return userData;
}
