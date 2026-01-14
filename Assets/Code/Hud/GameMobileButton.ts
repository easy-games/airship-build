import { Airship } from "@Easy/Core/Shared/Airship";
import { AirshipCameraSingleton } from "@Easy/Core/Shared/Camera/AirshipCameraSingleton";
import { Dependency } from "@Easy/Core/Shared/Flamework";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { CanvasAPI } from "@Easy/Core/Shared/Util/CanvasAPI";
import MobileHudManager from "./MobileHudManager";

const MIN_ROT_X = math.rad(1);
const MAX_ROT_X = math.rad(179);
const TAU = math.pi * 2;
const SENS_SCALAR = 0.01;

export default class GameMobileButton extends AirshipBehaviour {
	private bin = new Bin();

	private dragging = false;
	private touchPointerId = 0;
	private isPaused = false;
	private touchStartRotX = 0;
	private touchStartRotY = 0;
	private touchStartPos = Vector2.zero;
	private needsTouchPosUpdate = false;

	public InitializeMoveCameraOnDrag() {
		CanvasAPI.OnBeginDragEvent(this.gameObject, (data) => {
			MobileHudManager.Get().CancelAllButtonDrags();
			Airship.Input.GetMobileCameraMovement()?.CancelDrag();
			MobileHudManager.Get().AddCameraDrag(this);
			const camSystem = Dependency<AirshipCameraSingleton>().cameraSystem;
			if (!camSystem) return;
			const camMode = camSystem.GetMode();

			this.dragging = true;

			this.touchPointerId = data.pointerId;
			this.touchStartPos = data.position;
			this.touchStartRotX = camMode.rotationX;
			this.touchStartRotY = camMode.rotationY;
		});

		CanvasAPI.OnDragEvent(this.gameObject, (data) => {
			if (!this.dragging || this.isPaused) return;

			// Update touch start position if we just resumed from pause
			if (this.needsTouchPosUpdate) {
				this.touchStartPos = data.position;
				this.needsTouchPosUpdate = false;
			}

			const camSystem = Dependency<AirshipCameraSingleton>().cameraSystem;
			if (!camSystem) return;
			const camMode = camSystem.GetMode();

			if (this.touchPointerId !== data.pointerId) return;
			const deltaPosSinceStart = data.position.sub(this.touchStartPos);
			const touchSensitivity = contextbridge.invoke<() => number>(
				"ClientSettings:GetTouchSensitivity",
				LuauContext.Protected,
			);
			camMode.rotationY = (this.touchStartRotY - deltaPosSinceStart.x * SENS_SCALAR * touchSensitivity) % TAU;
			camMode.rotationX = math.clamp(
				this.touchStartRotX + deltaPosSinceStart.y * SENS_SCALAR * touchSensitivity,
				MIN_ROT_X,
				MAX_ROT_X,
			);
		});

		CanvasAPI.OnEndDragEvent(this.gameObject, (data) => {
			this.dragging = false;

			if (this.touchPointerId === data.pointerId) {
				this.touchPointerId = -1;
			}
		});
	}

	public IsDragging(): boolean {
		return this.dragging;
	}

	public PauseDrag(): void {
		this.isPaused = true;
	}

	public ResumeDrag(): void {
		this.isPaused = false;
		// Update rotation reference points to current camera position
		const camSystem = Dependency<AirshipCameraSingleton>().cameraSystem;
		if (camSystem) {
			const camMode = camSystem.GetMode();
			this.touchStartRotX = camMode.rotationX;
			this.touchStartRotY = camMode.rotationY;
		}
		this.needsTouchPosUpdate = true;
	}

	public CancelActiveDrag() {
		this.touchPointerId = -1;
		this.dragging = false;
		this.isPaused = false;
	}

	override OnDestroy(): void {
		this.bin.Clean();
	}
}
