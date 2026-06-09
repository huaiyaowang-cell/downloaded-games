{
  const script = document.createElement("script");
  script.src = "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
  document.head.appendChild(script);

  script.onload = () => {
    globalThis.PokiSDK.init().then(() => {
      window["POKI_LOADED"] = true;
      window.dispatchEvent(new CustomEvent("POKI_LOADED"));
    });
  };

  // if (poki) {
  window.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case " ":
        event.preventDefault();
    }
  });

  window.addEventListener("wheel", (event) => event.preventDefault(), {
    passive: false,
  });
  // }
}
