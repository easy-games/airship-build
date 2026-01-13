import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { NetworkUtil } from "@Easy/Core/Shared/Util/NetworkUtil";
import { ItemType } from "Code/Item/ItemType";
import { WorldProfile } from "Code/ProfileManager/WorldProfile";
import LoadedWorld from "./LoadedWorld";

export default class WorldManager extends AirshipSingleton {
	/** World the player is currently inside. */
	public currentWorld: VoxelWorld;
	public currentLoadedWorld: LoadedWorld;
	public playerWorldPrefab: GameObject;
	public starterSaveFile: WorldSaveFile;
	public voxelBlocks: VoxelBlocks;

	public uidToLoadedWorldMap = new Map<string, LoadedWorld>();

	private enterWorldNetSig = new NetworkSignal<[userId: string, worldNetId: number]>("WorldManager:EnterWorld");
	private exitWorldNetSig = new NetworkSignal<[userId: string, worldNetId: number]>("WorldManager:ExitWorld");
	private addLoadedWorldNetSig = new NetworkSignal<[worldNetId: number, offset: Vector3]>(
		"WorldManager:AddLoadedWorld",
	);
	private removeLoadedWorldNetSig = new NetworkSignal<[worldNetId: number]>("WorldManager:RemoveLoadedWorld");

	private loadedWorlds: LoadedWorld[] = [];

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
		if (Game.IsClient()) this.StartClient();
		if (Game.IsServer()) this.StartServer();
	}

	@Server()
	private StartServer() {
		Airship.Players.onPlayerDisconnected.Connect((player) => {
			const world = this.GetLoadedWorldFromPlayer(player);
			if (world) {
				world.ExitWorld(player);
				this.exitWorldNetSig.server.FireAllClients(player.userId, world.networkIdentity.netId);
				if (world.playersInWorld.size() === 0) {
					this.UnloadWorld(world);
				}
			}
		});
	}

	@Client()
	private StartClient() {
		this.addLoadedWorldNetSig.client.OnServerEvent((worldNetId, offset) => {
			const loadedWorld = this.WaitForLoadedWorldFromNetId(worldNetId);
			loadedWorld.offset = offset;
			this.loadedWorlds.push(loadedWorld);
		});

		this.enterWorldNetSig.client.OnServerEvent((userId, worldNetId) => {
			const loadedWorld = this.WaitForLoadedWorldFromNetId(worldNetId);
			const player = Airship.Players.FindByUserId(userId);
			if (player) {
				loadedWorld.EnterWorld(player);
			}
		});
	}

	public GetLoadedWorldFromPlayer(player: Player): LoadedWorld | undefined {
		if (this.uidToLoadedWorldMap.has(player.userId)) {
			return this.uidToLoadedWorldMap.get(player.userId);
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

		loadedWorld.offset = offset;
		loadedWorld.transform.position = loadedWorld.offset;
		NetworkServer.Spawn(go);

		if (worldProfile.saveFileData === undefined) {
			loadedWorld.voxelWorld.voxelWorldFile = this.starterSaveFile;
			loadedWorld.voxelWorld.LoadWorldFromSaveFile(this.starterSaveFile);
		}

		this.loadedWorlds.push(loadedWorld);
		this.addLoadedWorldNetSig.server.FireAllClients(loadedWorld.networkIdentity.netId, loadedWorld.offset);

		return loadedWorld;
	}

	@Server()
	public UnloadWorld(world: LoadedWorld): void {
		const offset = world.offset;
		this.removeLoadedWorldNetSig.server.FireAllClients(world.networkIdentity.netId);
		NetworkServer.Destroy(world.gameObject);

		// return offset to available list
		this.availableOffsets.push(offset);
	}

	@Server()
	public MovePlayerToLoadedWorld(player: Player, loadedWorld: LoadedWorld): void {
		if (player.character) {
			player.character.Despawn();
		}
		const spawnPos = loadedWorld.transform.position.add(new Vector3(0.5, 14, 0.5));
		const character = player.SpawnCharacter(spawnPos, {
			lookDirection: loadedWorld.transform.forward,
		});
		this.uidToLoadedWorldMap.set(player.userId, loadedWorld);
		loadedWorld.EnterWorld(player);
		this.enterWorldNetSig.server.FireAllClients(player.userId, loadedWorld.networkIdentity.netId);

		const inv = character.inventory;
		inv.AddItem(new ItemStack(ItemType.EmeraldPickaxe));
		inv.AddItem(new ItemStack(ItemType.Dirt));
		inv.AddItem(new ItemStack(ItemType.Stone));
		inv.AddItem(new ItemStack(ItemType.Obsidian));
	}

	public WaitForWorldLoaded(): void {}

	override OnDestroy(): void {}
}
