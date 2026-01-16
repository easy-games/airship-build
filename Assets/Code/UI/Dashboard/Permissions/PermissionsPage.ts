import { Airship, Platform } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { AppManager } from "@Easy/Core/Shared/Util/AppManager";
import inspect from "@Easy/Core/Shared/Util/Inspect";
import SoundUtil from "Code/Misc/SoundUtil";
import WorldManager from "Code/World/WorldManager";
import PermissionPlayer from "./PermissionPlayer";

export default class PermissionsPage extends AirshipBehaviour {
	public permissionPlayerPrefab: GameObject;
	public content: RectTransform;
	public backBtn: Button;

	private uidToPermissionPlayer = new Map<string, PermissionPlayer>();

	override Start(): void {
		if (!Game.IsClient()) return;

		this.backBtn.onClick.Connect(() => {
			SoundUtil.PlayClick();
			AppManager.Close();
		});

		this.content.gameObject.ClearChildren();

		const world = WorldManager.Get().WaitForLocalOwnedWorld();
		for (const uid of world.buildPermissionUids) {
			const permissionPlayer = Instantiate(
				this.permissionPlayerPrefab,
				this.content,
			).GetAirshipComponent<PermissionPlayer>()!;
			this.uidToPermissionPlayer.set(uid, permissionPlayer);
			permissionPlayer.InitOfflinePlayer(uid);
			permissionPlayer.SetHasBuildPermission(true);
		}

		// Fetch usernames for all the offline players in build list
		task.spawn(async () => {
			const data = await Platform.Client.User.GetUsersById(world.buildPermissionUids, false);
			print("users: " + inspect(data.array));
			for (const user of data.array) {
				const permissionPlayer = this.GetPermissionPlayer(user.uid);
				permissionPlayer?.SetUsername(user.username);
			}
		});

		Airship.Players.ObservePlayers((player) => {
			if (!Game.IsEditor() && player === Game.localPlayer) return;
			const existing = this.GetPermissionPlayer(player.userId);
			if (existing) {
				// update username just in case it changed
				existing.SetUsername(player.username);
				return;
			}

			const permissionPlayer = Instantiate(
				this.permissionPlayerPrefab,
				this.content,
			).GetAirshipComponent<PermissionPlayer>()!;
			this.uidToPermissionPlayer.set(player.userId, permissionPlayer);
			permissionPlayer.InitPlayer(player);

			return () => {
				if (!permissionPlayer.HasBuildPermission()) {
					this.uidToPermissionPlayer.delete(player.userId);
					Destroy(permissionPlayer.gameObject);
				}
			};
		});
	}

	public GetPermissionPlayer(uid: string): PermissionPlayer | undefined {
		return this.uidToPermissionPlayer.get(uid);
	}

	override OnDestroy(): void {}
}
