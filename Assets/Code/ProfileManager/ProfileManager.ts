import { Airship, Platform } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ChatColor } from "@Easy/Core/Shared/Util/ChatColor";
import { Signal, SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import { SetInterval } from "@Easy/Core/Shared/Util/Timer";
import WorldManager from "Code/World/WorldManager";
import { PlayerProfile } from "./PlayerProfile";
import { WorldProfile } from "./WorldProfile";

export default class ProfileManager extends AirshipSingleton {
	public profiles = new Map<string, PlayerProfile>();
	public onProfileLoaded = new Signal<[player: Player, Profile: PlayerProfile]>();

	override Start(): void {
		if (Game.IsServer()) {
			Airship.Players.ObservePlayers((player) => {
				task.spawn(async () => {
					await this.LoadPlayer(player);
				});
				return () => {
					task.spawn(async () => {
						this.SaveProfile(player);
					});
				};
			}, SignalPriority.HIGHEST);
		}

		// Autosave
		SetInterval(60, async () => {
			for (const player of Airship.Players.GetPlayers()) {
				try {
					await this.SaveProfile(player);
				} catch (err) {
					Debug.LogError(err);
				}
			}
		});
	}

	private ReconcileWorldProfile(worldProfile: WorldProfile): void {
		if (!worldProfile.buildPermissionUids) {
			worldProfile.buildPermissionUids = [];
		}
	}

	private ReconcilePlayerProfile(playerProfile: PlayerProfile): void {}

	private async LoadPlayer(player: Player): Promise<void> {
		let profile: PlayerProfile;
		if (Game.IsEditor()) {
			profile = this.MakeNewPlayerProfile(player);
		} else {
			// Real server
			try {
				const data = await Platform.Server.DataStore.GetKey<PlayerProfile>(`Player:${player.userId}`);
				if (data) {
					profile = data;
					this.ReconcilePlayerProfile(profile);
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
		if (profile.worldIds.size() === 0) {
			worldProfile = this.MakeNewWorldProfile(player);
			profile.worldIds.push(worldProfile.id);
		} else {
			// pull from datastore
			const wp = await Platform.Server.DataStore.GetKey<WorldProfile>(`World:${profile.worldIds[0]}`);
			if (!wp) {
				// player.SendMessage(ChatColor.Red("Failed to load world."));
				Game.BroadcastMessage(
					ChatColor.Red(
						ChatColor.Bold(
							"Failed to load " +
								player.username +
								"'s world. They may need to type " +
								ChatColor.Yellow("/delworld") +
								" to reset their world.",
						),
					),
				);
				return;
			}
			worldProfile = wp;
			this.ReconcileWorldProfile(worldProfile);
		}

		this.onProfileLoaded.Fire(player, profile);

		const loadedWorld = WorldManager.Get().LoadWorldFromProfile(worldProfile, player);
		if (loadedWorld) {
			WorldManager.Get().MovePlayerToLoadedWorld(player, loadedWorld);
		} else {
			// todo: spawn in another world?
		}
	}

	public async SaveProfile(player: Player): Promise<void> {
		const profile = await this.GetProfileAsync(player);
		await Platform.Server.DataStore.SetKey(`Player:${player.userId}`, profile);
	}

	public MakeNewWorldProfile(owner: Player): WorldProfile {
		const id = Guid.NewGuid().ToString();
		return {
			id,
			createTime: os.time(),
			ownerUid: owner.userId,
			lastSaveTime: os.time(),
			buildPermissionUids: [],
		};
	}

	private MakeNewPlayerProfile(player: Player): PlayerProfile {
		return {
			worldIds: [],
			firstJoinTime: os.time(),
		};
	}

	public async GetProfileAsync(player: Player): Promise<PlayerProfile> {
		return this.WaitForProfile(player);
	}

	public WaitForProfile(player: Player): PlayerProfile {
		while (!this.profiles.has(player.userId)) {
			task.wait();
		}
		return this.profiles.get(player.userId)!;
	}

	override OnDestroy(): void {}
}
