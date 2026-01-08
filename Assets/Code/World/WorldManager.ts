export default class WorldManager extends AirshipSingleton {
	/** World the player is currently inside. */
	public currentWorld: VoxelWorld = VoxelWorld.GetFirstInstance();

	override Start(): void {}

	public WaitForWorldLoaded(): void {}

	override OnDestroy(): void {}
}
