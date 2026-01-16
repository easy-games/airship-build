import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { NetworkFunction } from "@Easy/Core/Shared/Network/NetworkFunction";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { NetworkUtil } from "@Easy/Core/Shared/Util/NetworkUtil";
import { SetInterval } from "@Easy/Core/Shared/Util/Timer";
import { ItemType } from "Code/Item/ItemType";
import { WorldProfile } from "Code/ProfileManager/WorldProfile";
import LoadedWorld, { LoadedWorldDto } from "./LoadedWorld";

export default class WorldManager extends AirshipSingleton {
	/** World the player is currently inside. */
	public currentWorld: VoxelWorld;
	public currentLoadedWorld: LoadedWorld;
	public playerWorldPrefab: GameObject;
	public starterSaveFile: WorldSaveFile;
	public voxelBlocks: VoxelBlocks;

	/** LoadedWorld owned by local player */
	public localOwnedWorld: LoadedWorld | undefined;

	@NonSerialized() public redirectId: number;
	@NonSerialized() public grassBlockId = -1;

	public uidToCurrentLoadedWorldMap = new Map<string, LoadedWorld>();

	private addLoadedWorldNetSig = new NetworkSignal<[LoadedWorldDto]>("WorldManager:AddLoadedWorld");

	private getLoadedWorldsNetFunc = new NetworkFunction<[], [LoadedWorldDto[]]>("WorldManager:GetLoadedWorlds");

	private enterWorldNetSig = new NetworkSignal<[userId: string, worldNetId: number]>("WorldManager:EnterWorld");
	private exitWorldNetSig = new NetworkSignal<[userId: string, worldNetId: number]>("WorldManager:ExitWorld");
	private removeLoadedWorldNetSig = new NetworkSignal<[worldNetId: number]>("WorldManager:RemoveLoadedWorld");

	/** Sent to all clients whenever build permission changes on a world for a player */
	public buildPermissionChangedNetSig = new NetworkSignal<[uid: string, worldNetId: number, hasPermission: boolean]>(
		"WorldManager:WorldPermissionChanged",
	);

	public loadedWorlds: LoadedWorld[] = [];

	private availableOffsets = new Array<Vector3>();

	protected Awake(): void {
		for (let x = -5; x <= 5; x++) {
			for (let z = -5; z <= 5; z++) {
				this.availableOffsets.push(new Vector3(500 * x, 0, 500 * z));
			}
		}
	}

	override Start(): void {
		// if (Game.IsServer()) {
		// 	this.currentWorld.LoadWorldFromSaveFile(this.currentWorld.voxelWorldFile);
		// }
		this.voxelBlocks.Reload(false);
		this.redirectId = this.voxelBlocks.GetBlockIdFromStringId("@Easy/VoxelWorld:Redirect");
		this.grassBlockId = this.voxelBlocks.GetBlockIdFromStringId("@Easy/VoxelWorld:Grass");

		if (Game.IsClient()) this.StartClient();
		if (Game.IsServer()) this.StartServer();
	}

	@Server()
	private StartServer() {
		Airship.Players.onPlayerDisconnected.Connect(async (player) => {
			const world = this.GetLoadedWorldOwnedByPlayer(player);
			if (world) {
				world.ExitWorld(player);
				this.exitWorldNetSig.server.FireAllClients(player.userId, world.networkIdentity.netId);
				this.UnloadWorld(world, true);
			}
		});

		// Autosave
		SetInterval(60, async () => {
			for (const world of this.loadedWorlds) {
				if (world.IsOwnerOnline()) {
					try {
						await world.SaveAsync();
					} catch (err) {
						Debug.LogError(err);
					}
				}
			}
		});

		this.getLoadedWorldsNetFunc.server.SetCallback((player) => {
			const dtos = this.loadedWorlds.map((l) => l.MakeDto());
			return dtos;
		});
	}

	@Client()
	private StartClient() {
		this.addLoadedWorldNetSig.client.OnServerEvent((dto) => {
			const loadedWorld = this.WaitForLoadedWorldFromNetId(dto[0]);
			loadedWorld.InitClient(dto);
			this.loadedWorlds.push(loadedWorld);

			if (loadedWorld.IsOwner(Game.localPlayer)) {
				this.localOwnedWorld = loadedWorld;
			}
		});

		this.enterWorldNetSig.client.OnServerEvent((userId, worldNetId) => {
			const loadedWorld = this.WaitForLoadedWorldFromNetId(worldNetId);
			const player = Airship.Players.FindByUserId(userId);
			if (player) {
				loadedWorld.EnterWorld(player);
			}
		});

		this.exitWorldNetSig.client.OnServerEvent((userId, worldNetId) => {
			const loadedWorld = this.WaitForLoadedWorldFromNetId(worldNetId);
			const player = Airship.Players.FindByUserId(userId);
			if (player) {
				loadedWorld.ExitWorld(player);
			}
		});

		const existingWorlds = this.getLoadedWorldsNetFunc.client.FireServer();
		for (const dto of existingWorlds) {
			if (this.loadedWorlds.find((w) => w.networkIdentity.netId === dto[0])) continue;
			task.spawn(() => {
				const loadedWorld = this.WaitForLoadedWorldFromNetId(dto[0]);
				loadedWorld.InitClient(dto);
				this.loadedWorlds.push(loadedWorld);

				if (loadedWorld.IsOwner(Game.localPlayer)) {
					this.localOwnedWorld = loadedWorld;
				}
			});
		}

		this.buildPermissionChangedNetSig.client.OnServerEvent((uid, worldNetId, hasPermission) => {
			const loadedWorld = this.WaitForLoadedWorldFromNetId(worldNetId);
			loadedWorld.SetBuildPermission(uid, hasPermission);
		});
	}

	/**
	 * Gets the world the player is currently in
	 * @param player
	 * @returns
	 */
	public GetCurrentLoadedWorldFromPlayer(player: Player): LoadedWorld | undefined {
		if (this.uidToCurrentLoadedWorldMap.has(player.userId)) {
			return this.uidToCurrentLoadedWorldMap.get(player.userId);
		}
		return undefined;
	}

	public GetLoadedWorldOwnedByPlayer(player: Player): LoadedWorld | undefined {
		for (const loadedWorld of this.loadedWorlds) {
			if (loadedWorld.IsOwner(player)) {
				return loadedWorld;
			}
		}
		return undefined;
	}

	public WaitForLoadedWorldFromNetId(netId: number) {
		const id = NetworkUtil.WaitForNetworkIdentity(netId);
		const loadedWorld = id.gameObject.GetAirshipComponent<LoadedWorld>()!;
		return loadedWorld;
	}

	@Server()
	public LoadWorldFromProfile(worldProfile: WorldProfile, ownerPlayer?: Player): LoadedWorld | undefined {
		if (this.availableOffsets.size() === 0) {
			print("No world offsets available.");
			return undefined;
		}
		const offset = this.availableOffsets[0];
		this.availableOffsets.remove(0);

		const go = Instantiate(this.playerWorldPrefab);
		if (ownerPlayer) {
			go.name = "VoxelWorld - " + ownerPlayer.username;
		}
		const loadedWorld = go.GetAirshipComponent<LoadedWorld>()!;

		loadedWorld.InitServer(worldProfile, offset);
		go.transform.position = offset;
		NetworkServer.Spawn(go);

		// Test code to give real player permission in bot worlds
		if (ownerPlayer?.IsBot()) {
			for (const player of Airship.Players.GetPlayers()) {
				if (player === ownerPlayer) continue;
				print("giving build perm to " + player.userId);
				loadedWorld.SetBuildPermission(player.userId, true);
			}
		}

		if (Game.IsEditor()) {
			worldProfile.saveFileData =
				"KLUv/WDsDh0qAPZ5zkmw2E0H/CE9c08fGndOeUr/JnXoGF/KM5UXpqBAQj9ZCkJbrjWSXJsJzSbZSbz8NA51prKmBw15BMVjxxn0pZWYwZJD50eVQh3JrgCxALAAP0U9av9Dnfx3V5vLp1GPev6eqeBFsdw5uHzttSUwogh8V4zj+KZr7WbrMXYRB3T5ThnA5aqlCpRYBrP5x3pnO9Nmi66vdaoaal0nVv3xTAI68WqZ56cR71i1fzlzBv+Hvm8ulOHK+ly/BHOATldZjOffNgE4M4D2rP+LTRid+Fimb922BfMlyWL9IfYVb4VgupBk1U06E8DWd5a0cVmxfEbERVamDgpmi77VZZYBlGgqCU0OGxxnmWjR1KB1d9Uv+ox6QzOD2ypWWhKGPJb4PzqR9D+mXaAeZTAtkOUWK5BVK9ePAt3aSZ9NoNapjmwuXzc9mEZFm/TcR5TddZMEnfhUXgSS/NqQzdUmpB+/eDcua0FAEHTFJc61fqIedTAfHM0fH9Lx7fZfD5fWnvuoR42mA1zFu7VbUaDZwGdSXHd+Fle/U9BksPU235AnJ+6aA3d0ueKpmE7XGfXogk0GdMRZf6jTbq/WnaX4v41VdnNcJPk13PgkiS+IlWuUY2HPkbp/mXVboURv3sarwWpx1T4yoThhwjrVFcZ1tJUYy2u9RsLLGh0cQT36M0V4JVSI0Ip0jMs3V4VxDSlIte98QxuV43SNAoE3Wb+prNfiLqWkXKy0BvNDLWrLxScPVdtcglCbfI1VR+1PuV57yZuUk61TOTGXNarJx4ttNKYZFq5O9JsgO1oyopt0sMN4NRgxOrZ4lLLo7Fy6aAZgBMxg0uPKzgkSkCgwYkDY3CQbOTiwAV02NKhMaVLDA0kIyhAWGq/GUrijwm5CenZuxHZJgnjFljxkib3AZna7JTJKTACBN0eUprh4FRUJipEQE/qS+dihYib50bL11ZDpulJy5EbMjBONUI6NF0+OqsoEydCVD9GPCycyUORUPYkRm1+VmiFWYHSQcLyQQo12TrCvr6+vnRO4C3fhhM2XCaBrwrSYLTurLixERIDmnEbAD+DN3KTmsi/71zmyrKm4Vz+Y9b6z5331zbJRL4DpqHGtYabKSJIsY1AiIYaqzAMSAAJJDkMQiIEQhgBkcGdEEkmaZQ0hDBOT7/HRSmOBQs41OLR9LXcVxi8XxNuxFhIRqIMQBPUa+uw11gOmMmIequVmh1xUAdbOdJO6eJ0s4VzZbTsSh/BQrLkSHE9imcKl+dwF1jqZlRM4SCx2TWMpyH5wYI1Iyz8pRpen1rsLSGdX0FgYfcOiqLnM23FkNJ1/+9ZLHSTQaefkWWkbT7HLd4dvtn8MQveV6s9pBq+OAyG5N5aEZgGradwB9wc13ANRDtgy+CkqTz7fQRE7xlKeXCj6pJPQcGzRjv6/Bsjkngfs2tdJ3Qb0WcyIomeJur5kpoPfLZtWhvtbbA2gPWgsUVFruXWlLdEYRMMAhVCP+S7UKpvx1maBjMqyjA3sqY/AY16DoccIPCUyYuK5GQ+UFGwQxist3kvDxwOVAWA9HS6TQuVA9S24BujZQ0tWp9gx3ZGozQyLj5kXbL7yz4tH9AmjRorD/nAisV89WV7eX08T3lE9kDW9afBswO20w33mQ3mB0rlftl6NnErwO1ukcCdNeXaKhL77oVdxeoPCxmFOuI94AilUKl65QnqIaGcBMBAXeiQm4rUOVqB/H+I0omr+fzoOg+gH5ISNnKybhDZttRI4w/uDrOBg9DfuOMKrkIfqq89fJvIkAcPKz4mOUQF3CQ==";
		}
		if (worldProfile.saveFileData === undefined) {
			print("Missing save file data. Loading world from starter file.");
			loadedWorld.voxelWorld.voxelWorldFile = this.starterSaveFile;
			loadedWorld.voxelWorld.LoadWorldFromSaveFile(this.starterSaveFile);
		} else {
			print("Decoding world from string.");
			loadedWorld.voxelWorld.DecodeFromString(worldProfile.saveFileData);
		}

		this.loadedWorlds.push(loadedWorld);
		this.addLoadedWorldNetSig.server.FireAllClients(loadedWorld.MakeDto());

		return loadedWorld;
	}

	@Server()
	public async UnloadWorld(world: LoadedWorld, save: boolean): Promise<void> {
		if (save) {
			for (let i = 0; i < 3; i++) {
				try {
					const success = await world.SaveAsync();
					if (success) {
						break;
					}
				} catch (err) {
					Debug.LogError(err);
					if (i < 2) {
						task.wait(0.5);
					}
				}
			}
		}
		world.isUnloading = true;

		// Move players back to their own worlds
		for (const player of world.playersInWorld) {
			if (world.IsOwner(player)) continue;
			const ownedWorld = this.GetLoadedWorldOwnedByPlayer(player);
			if (ownedWorld) {
				task.spawn(() => {
					this.MovePlayerToLoadedWorld(player, ownedWorld);
				});
			} else {
				Debug.LogError("Unsure where to move player during world unload: " + player.username);
			}
		}

		const offset = world.offset;
		this.removeLoadedWorldNetSig.server.FireAllClients(world.networkIdentity.netId);
		NetworkServer.Destroy(world.gameObject);

		// return offset to available list
		this.availableOffsets.push(offset);
		const idx = this.loadedWorlds.indexOf(world);
		if (idx >= 0) {
			this.loadedWorlds.remove(idx);
		}
	}

	@Server()
	public MovePlayerToLoadedWorld(
		player: Player,
		loadedWorld: LoadedWorld,
		config?: {
			targetLocation?: {
				position: Vector3;
				forward: Vector3;
			};
		},
	): void {
		const spawnLoc = config?.targetLocation ?? loadedWorld.GetSpawnLocation();
		if (player.character?.IsAlive()) {
			player.character.Teleport(spawnLoc.position, spawnLoc.forward);
		} else {
			player.character?.Despawn();
			const character = player.SpawnCharacter(spawnLoc.position, {
				lookDirection: spawnLoc.forward,
			});
			const inv = character.inventory;
			inv.AddItem(new ItemStack(ItemType.EmeraldPickaxe));
			inv.AddItem(new ItemStack(ItemType.Grass));
			inv.AddItem(new ItemStack(ItemType.Slate));
			inv.AddItem(new ItemStack(ItemType.Obsidian));
		}

		// leave existing world
		const existingWorld = this.GetCurrentLoadedWorldFromPlayer(player);
		if (existingWorld) {
			existingWorld.ExitWorld(player);
			this.exitWorldNetSig.server.FireAllClients(player.userId, existingWorld.networkIdentity.netId);
		}

		this.uidToCurrentLoadedWorldMap.set(player.userId, loadedWorld);
		loadedWorld.EnterWorld(player);
		this.enterWorldNetSig.server.FireAllClients(player.userId, loadedWorld.networkIdentity.netId);
	}

	public WaitForWorldLoaded(): void {}

	public WaitForLocalOwnedWorld(): LoadedWorld {
		while (this.localOwnedWorld === undefined) {
			task.wait();
		}
		return this.localOwnedWorld;
	}

	override OnDestroy(): void {}
}
