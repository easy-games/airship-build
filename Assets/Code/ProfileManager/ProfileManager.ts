import { Airship, Platform } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { Signal, SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import WorldManager from "Code/World/WorldManager";
import { PlayerProfile } from "./PlayerProfile";
import { WorldProfile } from "./WorldProfile";

export default class ProfileManager extends AirshipSingleton {
	public profiles = new Map<string, PlayerProfile>();
	public onProfileLoaded = new Signal<[player: Player, Profile: PlayerProfile]>();

	override Start(): void {
		if (Game.IsServer()) {
			Airship.Players.ObservePlayers((player) => {
				task.spawn(() => {
					this.LoadPlayer(player);
				});
			}, SignalPriority.HIGHEST);
		}
	}

	private LoadPlayer(player: Player): void {
		let profile: PlayerProfile;
		if (Game.IsEditor()) {
			profile = this.MakeNewPlayerProfile(player);
		} else {
			// Real server
			try {
				const data = Platform.Server.DataStore.GetKey<PlayerProfile>("player:" + player.userId).expect();
				if (data) {
					profile = data;
				} else {
					profile = this.MakeNewPlayerProfile(player);
				}
			} catch (err) {
				Debug.LogError("Failed to load player profile for " + player.username + ": " + err);
				player.Kick("Failed to load profile: " + err);
				return;
			}
		}

		this.profiles.set(player.userId, profile);

		let worldProfile: WorldProfile;
		if (profile.worldIds.size() === 0 || true) {
			worldProfile = this.MakeNewWorldProfile(player);
			profile.worldIds.push(worldProfile.id);
		} else {
			// pull from datastore
		}

		this.onProfileLoaded.Fire(player, profile);

		const loadedWorld = WorldManager.Get().LoadWorldFromProfile(worldProfile, player);
		WorldManager.Get().MovePlayerToLoadedWorld(player, loadedWorld);
	}

	private MakeNewWorldProfile(owner: Player): WorldProfile {
		const id = "1";
		return {
			id,
			createTime: os.time(),
			ownerUid: owner.userId,
		};
	}

	private MakeNewPlayerProfile(player: Player): PlayerProfile {
		return {
			worldIds: [],
			firstJoinTime: os.time(),
		};
	}

	override OnDestroy(): void {}
}
