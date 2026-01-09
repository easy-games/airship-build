import { Modifier } from "@Easy/Core/Shared/Util/Modifier";

export default class HudManager extends AirshipSingleton {
	public crosshair: GameObject;

	private crosshairModifier = new Modifier<boolean>();

	override Start(): void {
		this.crosshairModifier.Observe((values) => {
			this.crosshair.SetActive(values.size() === 0);
		});
	}

	public AddCrosshairDisabler(): () => void {
		return this.crosshairModifier.Add(true);
	}

	override OnDestroy(): void {}
}
