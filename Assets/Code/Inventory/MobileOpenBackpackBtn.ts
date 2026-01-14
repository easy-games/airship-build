import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";

export default class MobileOpenBackpackBtn extends AirshipBehaviour {
	public button: Button;

	override Start(): void {
		if (!Game.IsMobile()) {
			this.gameObject.SetActive(false);
			return;
		}

		this.button.onClick.Connect(() => {
			Airship.Inventory.ui?.OpenBackpack();
		});
	}

	override OnDestroy(): void {}
}
