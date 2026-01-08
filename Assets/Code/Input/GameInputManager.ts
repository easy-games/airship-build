import { Airship } from "@Easy/Core/Shared/Airship";
import { Binding } from "@Easy/Core/Shared/Input/Binding";
import { ActionId } from "./ActionId";

export default class GameInputManager extends AirshipSingleton {
	protected Awake(): void {
		Airship.Input.CreateAction(ActionId.PlaceBlock, Binding.MouseButton(MouseButton.LeftButton), {
			hidden: true,
		});
	}
}
