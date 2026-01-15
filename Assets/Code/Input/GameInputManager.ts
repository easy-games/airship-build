import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { CoreAction } from "@Easy/Core/Shared/Input/AirshipCoreAction";
import { Binding } from "@Easy/Core/Shared/Input/Binding";
import { ActionId } from "./ActionId";
import { SettingId } from "./SettingId";

export default class GameInputManager extends AirshipSingleton {
	protected Awake(): void {
		Airship.Input.CreateAction(ActionId.PlaceBlock, Binding.MouseButton(MouseButton.LeftButton), {
			hidden: true,
		});
		Airship.Input.CreateAction(ActionId.BreakBlock, Binding.MouseButton(MouseButton.LeftButton), {
			hidden: true,
		});
		Airship.Input.CreateAction(ActionId.SelectBlock, Binding.MouseButton(MouseButton.MiddleButton));
		Airship.Input.CreateAction(ActionId.Dashboard, Binding.Key(Key.Tab));

		Airship.Settings.AddToggle(SettingId.BW2_Placement, false);

		Airship.Settings.AddToggle(SettingId.PostProcessing, true);
		const globalVolume = GameObject.Find("GlobalVolume");
		Airship.Settings.ObserveToggle(SettingId.PostProcessing, (val) => {
			globalVolume.SetActive(val);
		});
	}

	protected Start(): void {
		if (Game.IsClient()) this.StartClient();
	}

	private StartClient() {
		let lastJump = 0;
		Airship.Input.OnDown(CoreAction.Jump).Connect((e) => {
			if (Time.time - lastJump < 0.25) {
				if (Game.localPlayer.character) {
					Game.localPlayer.character.movement.SetFlying(!Game.localPlayer.character.movement.IsFlying());
				}
			}
			lastJump = Time.time;
		});
	}
}
