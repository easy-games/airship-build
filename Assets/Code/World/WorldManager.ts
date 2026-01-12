import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { ItemType } from "Code/Item/ItemType";
import { WorldProfile } from "Code/ProfileManager/WorldProfile";
import LoadedWorld from "./LoadedWorld";

export default class WorldManager extends AirshipSingleton {
	/** World the player is currently inside. */
	public currentWorld: VoxelWorld;
	public playerWorldPrefab: GameObject;
	public starterSaveFile: WorldSaveFile;
	public voxelBlocks: VoxelBlocks;

	public uidToLoadedWorldMap = new Map<string, LoadedWorld>();

	override Start(): void {
		// if (Game.IsServer()) {
		// 	this.currentWorld.LoadWorldFromSaveFile(this.currentWorld.voxelWorldFile);
		// }
	}

	@Server()
	public LoadWorldFromProfile(worldProfile: WorldProfile, ownerPlayer?: Player): LoadedWorld {
		const go = Instantiate(this.playerWorldPrefab);
		if (ownerPlayer) {
			go.name = "VoxelWorld - " + ownerPlayer.username;
		}
		NetworkServer.Spawn(go);

		const loadedWorld = go.GetAirshipComponent<LoadedWorld>()!;
		if (worldProfile.saveFileData === undefined) {
			loadedWorld.voxelWorld.voxelWorldFile = this.starterSaveFile;
			loadedWorld.voxelWorld.LoadWorldFromSaveFile(this.starterSaveFile);
		}

		return loadedWorld;
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

		const inv = character.inventory;
		inv.AddItem(new ItemStack(ItemType.EmeraldPickaxe));
		inv.AddItem(new ItemStack(ItemType.Dirt));
		inv.AddItem(new ItemStack(ItemType.Stone));
		inv.AddItem(new ItemStack(ItemType.Obsidian));
	}

	public WaitForWorldLoaded(): void {}

	override OnDestroy(): void {}
}
