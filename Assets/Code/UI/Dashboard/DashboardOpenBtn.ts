import SoundUtil from "Code/Misc/SoundUtil";
import Dashboard from "./Dashboard";

export default class DashboardOpenBtn extends AirshipBehaviour {
	public button: Button;

	override Start(): void {
		this.button.onClick.Connect(() => {
			SoundUtil.PlayClick();
			Dashboard.Get().Open();
		});
	}

	override OnDestroy(): void {}
}
