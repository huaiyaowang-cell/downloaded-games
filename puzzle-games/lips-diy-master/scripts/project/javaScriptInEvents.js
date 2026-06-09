

const scriptsInEvents = {

	async GameEvents_Event4_Act1(runtime, localVars)
	{
		runtime.StartGame();
	},

	async Eaad_Event19_Act3(runtime, localVars)
	{
		runtime.game.Epic.Bridge_OnInterstitialStarted();
	},

	async Eaad_Event20_Act3(runtime, localVars)
	{
		runtime.game.Epic.Bridge_OnInterstitialFinished(true);
	},

	async Eaad_Event25_Act3(runtime, localVars)
	{
		runtime.game.Epic.Bridge_OnRewardedStarted();
	},

	async Eaad_Event26_Act4(runtime, localVars)
	{
		runtime.game.Epic.Bridge_OnRewardedFinished(null, false);
	},

	async Eaad_Event27_Act2(runtime, localVars)
	{
		runtime.game.Epic.Bridge_OnRewardedFinished(localVars.tag, true);
	},

	async Eaad_Event29_Act1(runtime, localVars)
	{
		localVars.canToggle = runtime.gameplay.CanToggleGameplay(localVars.active)
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
