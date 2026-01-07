import { Airship, Platform } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";

export default class OutfitLoader extends AirshipBehaviour {
	@Tooltip("Outfit belonging to this username will be loaded onto the character.")
	public username: string;

	override async Start() {
		if (!Game.IsClient()) return;

		const accBuilder = this.gameObject.GetComponent<AccessoryBuilder>();
		if (!accBuilder) {
			Debug.LogError("Missing Accessory Builder.");
			return;
		}

		const user = await Platform.Client.User.GetUserByUsername(this.username);
		if (!user) {
			Debug.LogError("Unknown username: " + this.username);
			return;
		}

		const outfit = await Airship.Avatar.GetUserEquippedOutfitDto(user.uid);
		if (outfit) {
			Airship.Avatar.LoadOutfit(accBuilder, outfit);
		}
	}
}
