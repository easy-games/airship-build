import { Player } from "@Easy/Core/Shared/Player/Player";
import { WorldProfile } from "Code/ProfileManager/WorldProfile";
import WorldManager from "./WorldManager";

export default class LoadedWorld extends AirshipBehaviour {
	@NonSerialized() public worldProfile: WorldProfile;
	public voxelWorld: VoxelWorld;
	public networkIdentity: NetworkIdentity;
	public playersInWorld: Player[] = [];

	public offset: Vector3 = Vector3.zero;

	protected Awake(): void {
		this.voxelWorld.voxelBlocks = WorldManager.Get().voxelBlocks;
	}

	public EnterWorld(player: Player): void {
		print("Enter World: " + player.username);
		this.playersInWorld.push(player);
		if (player.IsLocalPlayer()) {
			WorldManager.Get().currentWorld = this.voxelWorld;
			WorldManager.Get().currentLoadedWorld = this;
		}
	}

	public ExitWorld(player: Player): void {
		const index = this.playersInWorld.indexOf(player);
		if (index >= 0) {
			this.playersInWorld.remove(index);
		}
	}

	override Start(): void {}

	override OnDestroy(): void {}
}
