import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { CanvasAPI } from "@Easy/Core/Shared/Util/CanvasAPI";
import { SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import { ActionId } from "Code/Input/ActionId";
import GameMobileButton from "./GameMobileButton";

export default class MobileHudManager extends AirshipSingleton {
	/** Tracks all active button drags so camera can cancel them. */
	private activeButtonCameraDrags = new Set<GameMobileButton>();

	override Start(): void {
		if (!Game.IsMobile()) return;
		if (Game.IsClient()) this.StartClient();
	}

	private StartClient(): void {
		this.SetupCameraDragListener();

		// Reset mobile joystick input on death
		Airship.Damage.onDeath.Connect((e) => {
			if (e.character?.player === Game.localPlayer) {
				const joystick = Airship.Input.GetMobileTouchJoystick();
				if (joystick) {
					joystick.StopDragEvent();
				}
			}
		});

		/**
		 * Break Button
		 */
		const breakBtn = Airship.Input.CreateMobileButton(ActionId.BreakBlock, new Vector2(-268, 564), {
			icon: "Assets/Resources/MobileBtnIcons/PickAxe_ICON.png",
			scale: Vector2.one.mul(0.8),
		}).AddAirshipComponent<GameMobileButton>()!;
		breakBtn.InitializeMoveCameraOnDrag();
		Airship.Input.OnDown(ActionId.BreakBlock).ConnectWithPriority(SignalPriority.HIGHEST, (e) => {
			const character = Game.localPlayer.character;
			if (!character) return;

			if (!character.GetHeldItem()?.itemDef.data?.blockBreaker) {
				// find block breaker item
				for (let i = 0; i <= 8; i++) {
					if (character.inventory.GetItem(i)?.itemDef.data?.blockBreaker) {
						character.SetHeldSlot(i);
						break;
					}
				}
			}
		});

		/**
		 * Place Button
		 */
		const placeBtn = Airship.Input.CreateMobileButton(ActionId.PlaceBlock, new Vector2(-365, 464), {
			icon: "Assets/Resources/MobileBtnIcons/Box_Icon.png",
			scale: Vector2.one.mul(0.8),
		}).AddAirshipComponent<GameMobileButton>()!;
		placeBtn.InitializeMoveCameraOnDrag();
		Airship.Input.OnDown(ActionId.PlaceBlock).ConnectWithPriority(SignalPriority.HIGHEST, (e) => {
			const character = Game.localPlayer.character;
			if (!character) return;

			if (!character.GetHeldItem()?.itemDef.data?.block) {
				// find block breaker item
				for (let i = 0; i <= 8; i++) {
					if (character.inventory.GetItem(i)?.itemDef.data?.block) {
						character.SetHeldSlot(i);
						break;
					}
				}
			}
		});
	}

	/**
	 * Sets up the camera drag listener.  Pauses button drags if camera drag is detected.
	 */
	private SetupCameraDragListener(): void {
		const cameraMovement = Airship.Input.GetMobileCameraMovement();
		if (cameraMovement) {
			CanvasAPI.OnBeginDragEvent(cameraMovement.gameObject, () => {
				this.PauseAllButtonDrags();
			});

			CanvasAPI.OnEndDragEvent(cameraMovement.gameObject, (event) => {
				this.ResumeAllButtonDrags();
			});
		}
	}

	/**
	 * Pauses all active button camera drags.
	 */
	private PauseAllButtonDrags(): void {
		for (const button of this.activeButtonCameraDrags) {
			button.PauseDrag();
		}
	}

	/**
	 * Resumes all paused button camera drags that are still active.
	 */
	private ResumeAllButtonDrags(): void {
		for (const button of this.activeButtonCameraDrags) {
			if (button.IsDragging()) {
				button.ResumeDrag();
			}
		}
	}

	/**
	 * Cancels all active button camera drags.
	 */
	public CancelAllButtonDrags(): void {
		for (const button of this.activeButtonCameraDrags) {
			button.CancelActiveDrag();
		}
		this.activeButtonCameraDrags.clear();
	}

	/**
	 * Adds a button to the list of active button camera drags.
	 */
	public AddCameraDrag(button: GameMobileButton): void {
		this.activeButtonCameraDrags.add(button);
	}
}
