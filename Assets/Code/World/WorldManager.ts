import { Game } from "@Easy/Core/Shared/Game";

export default class WorldManager extends AirshipSingleton {
	/** World the player is currently inside. */
	public currentWorld: VoxelWorld;

	override Start(): void {
		if (Game.IsServer()) {
			this.currentWorld.LoadWorldFromSaveFile(this.currentWorld.voxelWorldFile);
		}
	}

	public WaitForWorldLoaded(): void {}

	override OnDestroy(): void {}
}
