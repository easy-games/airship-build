import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";

export default class CacheManager extends AirshipSingleton {
	@NonSerialized()
	public localCharacterPosition: Vector3 | undefined;
	@NonSerialized()
	public mainCameraPosition: Vector3;
	@NonSerialized()
	public voxelWorldLayerMask: number;
	@NonSerialized()
	public terrainLayerMask: number; // Voxel World and Default (e.g. cacti)
	@NonSerialized()
	public characterLayerMask: number;
	@NonSerialized()
	public projectileLayerMask: number; // Projectile and Default (e.g. cacti)
	@NonSerialized()
	public kitSelectionLayerMask: number;
	@NonSerialized()
	public worldUILayerMask: number;

	protected override Start(): void {
		this.voxelWorldLayerMask = LayerMask.GetMask("VoxelWorld");
		this.terrainLayerMask = LayerMask.GetMask("Default", "VoxelWorld");
		this.characterLayerMask = LayerMask.GetMask("Character");
		this.projectileLayerMask = LayerMask.GetMask("Projectile");
		this.kitSelectionLayerMask = LayerMask.GetMask("KitSelectionScreen");
		this.worldUILayerMask = LayerMask.GetMask("WorldUI");
	}

	override Update(dt: number): void {
		if (Game.IsClient()) {
			this.localCharacterPosition = Game.localPlayer.character?.transform.position;
			this.mainCameraPosition = Airship.Camera.cameraRig!.mainCamera.transform.position;
		}
	}
}
