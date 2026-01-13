import { Game } from "@Easy/Core/Shared/Game";
import { Modifier } from "@Easy/Core/Shared/Util/Modifier";

export default class HudManager extends AirshipSingleton {
	public crosshair: GameObject;
	public pcGroup: GameObject;
	public mobileGroup: GameObject;

	private crosshairModifier = new Modifier<boolean>();

	override Start(): void {
		this.crosshairModifier.Observe((values) => {
			this.crosshair.SetActive(values.size() === 0);
		});

		if (Game.IsMobile()) {
			this.mobileGroup.SetActive(true);
			this.pcGroup.SetActive(false);
		} else {
			this.pcGroup.SetActive(true);
			this.mobileGroup.SetActive(false);
		}
	}

	public AddCrosshairDisabler(): () => void {
		return this.crosshairModifier.Add(true);
	}

	override OnDestroy(): void {}
}
