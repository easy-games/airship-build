import { Airship, Platform } from "@Easy/Core/Shared/Airship";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { WorldProfile } from "Code/ProfileManager/WorldProfile";
import WorldManager from "./WorldManager";

export type LoadedWorldDto = [
	worldNetId: number,
	offset: Vector3,
	worldId: string,
	ownerUserId: string,
	buildPermissionUids: string[],
];

export default class LoadedWorld extends AirshipBehaviour {
	/** Only available on server. */
	@NonSerialized() public worldProfile: WorldProfile | undefined;
	public voxelWorld: VoxelWorld;
	public networkIdentity: NetworkIdentity;
	public playersInWorld: Player[] = [];
	public ownerUid: string;
	public buildPermissionUids = new Array<string>();
	public isUnloading = false;

	@NonSerialized() public worldId: string;
	@NonSerialized() public offset: Vector3;

	public MakeDto(): LoadedWorldDto {
		return [this.networkIdentity.netId, this.offset, this.worldId, this.ownerUid, this.buildPermissionUids];
	}

	protected Awake(): void {
		this.voxelWorld.voxelBlocks = WorldManager.Get().voxelBlocks;
	}

	public InitClient(dto: LoadedWorldDto): void {
		this.offset = dto[1];
		this.worldId = dto[2];
		this.ownerUid = dto[3];
		this.buildPermissionUids = dto[4];
	}

	public InitServer(worldProfile: WorldProfile, offset: Vector3): void {
		this.worldProfile = worldProfile;
		this.worldId = this.worldProfile.id;
		this.offset = offset;
		this.ownerUid = this.worldProfile.ownerUid;
		this.buildPermissionUids = worldProfile.buildPermissionUids;
	}

	public IsOwnerOnline() {
		return this.GetOwnerPlayer() !== undefined;
	}

	public GetOwnerPlayer(): Player | undefined {
		return Airship.Players.FindByUserId(this.ownerUid);
	}

	public HasBuildPermission(player: Player): boolean {
		return this.IsOwner(player) || this.buildPermissionUids.includes(player.userId);
	}

	public IsInWorldBounds(worldPosition: Vector3): boolean {
		return worldPosition.WithY(0).sub(this.offset.WithY(0)).magnitude <= 250;
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
		if (!this.worldProfile) {
			Debug.LogError("Tried to save world but it had no world profile.");
			return false;
		}
		if (this.isUnloading) {
			Debug.LogError("Tried to save world while it's unloading. Cancelling save.");
			return false;
		}

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

		print(`Saved World:${this.worldId}`);
		return true;
	}

	public SetBuildPermission(uid: string, hasPermission: boolean): void {
		if (hasPermission) {
			if (!this.buildPermissionUids.includes(uid)) {
				this.buildPermissionUids.push(uid);
			}
		} else {
			const idx = this.buildPermissionUids.indexOf(uid);
			if (idx >= 0) {
				this.buildPermissionUids.remove(idx);
			}
		}
	}

	override Start(): void {}

	override OnDestroy(): void {}
}
