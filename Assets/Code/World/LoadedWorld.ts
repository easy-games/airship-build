import { Platform } from "@Easy/Core/Shared/Airship";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { WorldProfile } from "Code/ProfileManager/WorldProfile";
import WorldManager from "./WorldManager";

export default class LoadedWorld extends AirshipBehaviour {
	/** Only available on server. */
	@NonSerialized() public worldProfile: WorldProfile | undefined;
	public voxelWorld: VoxelWorld;
	public networkIdentity: NetworkIdentity;
	public playersInWorld: Player[] = [];
	public ownerUid: string;

	@NonSerialized() public worldId: string;
	@NonSerialized() public offset: Vector3;

	protected Awake(): void {
		this.voxelWorld.voxelBlocks = WorldManager.Get().voxelBlocks;
	}

	public InitClient(worldId: string, offset: Vector3, ownerUserId: string): void {
		this.worldId = worldId;
		this.offset = offset;
		this.ownerUid = ownerUserId;
	}

	public InitServer(worldProfile: WorldProfile, offset: Vector3): void {
		this.worldProfile = worldProfile;
		this.worldId = this.worldProfile.id;
		this.offset = offset;
		this.ownerUid = this.worldProfile.ownerUid;
	}

	public EnterWorld(player: Player): void {
		this.playersInWorld.push(player);
		if (player.IsLocalPlayer()) {
			WorldManager.Get().currentWorld = this.voxelWorld;
			WorldManager.Get().currentLoadedWorld = this;
		}
	}

	public GetSpawnLocation(): { position: Vector3; forward: Vector3 } {
		return {
			position: this.transform.position.add(new Vector3(0.5, 14, 0.5)),
			forward: this.transform.forward,
		};
	}

	public ExitWorld(player: Player): void {
		const index = this.playersInWorld.indexOf(player);
		if (index >= 0) {
			this.playersInWorld.remove(index);
		}
	}

	public IsOwner(player: Player): boolean {
		return this.ownerUid === player.userId;
	}

	@Server()
	public async SaveAsync(): Promise<boolean> {
		if (!this.worldProfile) return false;

		const startTime = os.clock();
		const saveData = this.voxelWorld.EncodeToString();
		print("Encoded world in " + math.round((os.clock() - startTime) * 1000) / 1000 + " ms.");

		this.worldProfile.saveFileData = saveData;
		this.worldProfile.lastSaveTime = os.time();
		try {
			await Platform.Server.DataStore.SetKey(`World:${this.worldId}`, this.worldProfile);
		} catch (err) {
			Debug.LogError(err);
			return false;
		}

		return true;
	}

	override Start(): void {}

	override OnDestroy(): void {}
}
