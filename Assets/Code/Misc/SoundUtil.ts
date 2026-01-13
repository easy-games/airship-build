import { Asset } from "@Easy/Core/Shared/Asset";
import { AudioManager } from "@Easy/Core/Shared/Audio/AudioManager";

export default class SoundUtil {
	public static PlayHover() {
		AudioManager.PlayClipGlobal(Asset.LoadAsset("Assets/AirshipPackages/@Easy/Core/Sound/UI_Notch.wav"));
	}

	public static PlayClick() {
		AudioManager.PlayClipGlobal(Asset.LoadAsset("Assets/AirshipPackages/@Easy/Core/Sound/UI_Select.wav"));
	}

	public static PlayError() {
		AudioManager.PlayClipGlobal(Asset.LoadAsset("Assets/AirshipPackages/@Easy/Core/Sound/UI_Error.ogg"));
	}
}
