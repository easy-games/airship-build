import { Airship } from "@Easy/Core/Shared/Airship";
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
	}
}
