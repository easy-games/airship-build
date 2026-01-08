export default class WorldManager extends AirshipSingleton {
	/** World the player is currently inside. */
	public currentWorld: VoxelWorld;

	override Start(): void {}

	public WaitForWorldLoaded(): void {}

	override OnDestroy(): void {}
}
