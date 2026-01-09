import { Airship } from "@Easy/Core/Shared/Airship";
import { Asset } from "@Easy/Core/Shared/Asset";
import { Game } from "@Easy/Core/Shared/Game";
import { ItemDef } from "@Easy/Core/Shared/Item/ItemDefinitionTypes";
import { Bin } from "@Easy/Core/Shared/Util/Bin";
import { SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import { OnLateUpdate, OnUpdate } from "@Easy/Core/Shared/Util/Timer";
import BlockSoundManager from "Code/BlockSound/BlockSoundManager";
import { ActionId } from "Code/Input/ActionId";
import ItemManager from "Code/Item/ItemManager";
import { ItemType } from "Code/Item/ItemType";
import ItemHandler from "Code/ItemHandler/ItemHandler";
import CacheManager from "Code/Misc/CacheManager";
import { MobileUtil } from "Code/Misc/MobileUtil";
import WorldManager from "Code/World/WorldManager";
import BlockPlacementManager, { MAX_BLOCKS_PER_SECOND } from "./BlockPlacementManager";
import { BlockRaycast } from "./BlockRaycast";
import { BlockUtil } from "./BlockUtil";

export default class BlockItemHandler extends ItemHandler {
	public blockPlaceAnimation: AnimationClip;
	public blockId: number | undefined;
	private equippedBlockAcc: GameObject | undefined;
	private lastVoidPlacement: number = 0;
	private lastRecordedVoidPlacement: number = 0;
	/** Number of repeated void placements in fast frequency (used to kick off void bridge only mode) */
	private voidPlacementStreak: number = 0;

	private lastHookPlacementPos: Vector3 | undefined;
	private lastHookPlacementLookVector: Vector3 | undefined;
	private mainDotToKeepLastHookPlacement = math.cos(math.rad(6));

	// Mobile Placement Variables
	private placementPosition: Vector3 | undefined;
	private indicatorPosition: Vector3 | undefined;
	private tapPlacementPosition: Vector3 | undefined;
	private ignoreTouchSet = new Set<number>();
	private activePlacementTouchId: number | undefined;
	private activeTouchScreenPosition: Vector2 | undefined;
	private placementPreviewBin = new Bin();

	public OnInit(): void {
		super.OnInit();
		this.blockPlaceAnimation = Asset.LoadAsset("Assets/Resources/Animations/Block/Character_BlockItem__Place.anim");
		this.idleAnimation = Asset.LoadAsset(
			"Assets/Resources/Animations/Block/Character_BlockItem__Jog-Sprint_Idle.anim",
		);
		this.equipAnimation = Asset.LoadAsset("Assets/Resources/Animations/Block/Character_BlockItem__Equip.anim");

		const itemDef = this.itemStack.itemDef;
		const worldManager = WorldManager.Get();

		if (itemDef.data?.block?.voxelName) {
			this.blockId = worldManager.currentWorld.voxelBlocks.SearchForBlockIdByString(
				itemDef.data!.block!.voxelName,
			);
		}
	}

	public OnEquip(): void {
		super.OnEquip();

		if (this.isLocal) {
			// this.bin.Add(HudControlsManager.Get().AddHudControlDisplay(HudControlDisplay.PlaceBlock));
			// this.bin.Add(HudManager.Get().crosshairDisablers.Add(1));
			this.bin.Add(
				OnLateUpdate.ConnectWithPriority(SignalPriority.MONITOR, (dt) => {
					this.UpdatePlacementPositionAndRefreshInidcators(dt);
				}),
			);
			this.bin.Add(
				OnUpdate.Connect((dt) => {
					if (Game.localPlayer.character?.IsDead()) return;

					BlockPlacementManager.Get().localTimeSinceLastPlacement += dt;
					if (
						BlockPlacementManager.Get().isLocalBlockQueued &&
						BlockPlacementManager.Get().localTimeSinceLastPlacement > 1 / MAX_BLOCKS_PER_SECOND
					) {
						this.SendPlaceBlock();
					}
				}),
			);

			if (Game.IsMobile()) {
				this.bin.Add(
					OnUpdate.Connect((dt) => {
						for (let i = 0; i < Input.touchCount; i++) {
							const touch = Input.GetTouch(i);
							const isTouchIgnored = this.ignoreTouchSet.has(touch.fingerId);

							if (touch.phase === TouchPhase.Began) {
								if (
									MobileUtil.IsTouchPositionOverUI(new Vector2(touch.position.x, touch.position.y)) &&
									!isTouchIgnored
								) {
									this.ignoreTouchSet.add(touch.fingerId);
								} else if (!isTouchIgnored && this.activePlacementTouchId === undefined) {
									this.activePlacementTouchId = touch.fingerId;
									this.activeTouchScreenPosition = new Vector2(touch.position.x, touch.position.y);
									this.StartTapPlacementPreview();
								}
							} else if (touch.phase === TouchPhase.Moved) {
								const joystick = Airship.Input.GetMobileTouchJoystick();
								const isCameraControl =
									Airship.Input.GetMobileCameraMovement()?.GetTouchPointerId() === touch.fingerId;
								const isJoystickControl =
									joystick?.IsJoystickVisible() && joystick?.GetTouchPointerId() === touch.fingerId;

								if (!isTouchIgnored && (isCameraControl || isJoystickControl)) {
									this.ignoreTouchSet.add(touch.fingerId);
									if (this.activePlacementTouchId === touch.fingerId) {
										this.ResetTapPlacementState();
									}
								} else if (this.activePlacementTouchId === touch.fingerId && !isTouchIgnored) {
									this.activeTouchScreenPosition = new Vector2(touch.position.x, touch.position.y);
								}
							} else if (touch.phase === TouchPhase.Ended) {
								if (isTouchIgnored) {
									this.ignoreTouchSet.delete(touch.fingerId);
									if (this.activePlacementTouchId === touch.fingerId) {
										this.ResetTapPlacementState();
									}
								} else if (this.activePlacementTouchId === touch.fingerId) {
									this.TryPlaceAtTapPosition(new Vector2(touch.position.x, touch.position.y));
								}
							} else if (touch.phase === TouchPhase.Canceled) {
								this.ignoreTouchSet.delete(touch.fingerId);
								if (this.activePlacementTouchId === touch.fingerId) {
									this.ResetTapPlacementState();
								}
							}
						}
					}),
				);
			}
		}

		if (Game.IsClient()) {
			// this.bin.Add(HudManager.Get().buildModeCamEnablers.Add(1));
			// this.bin.Add(HudManager.Get().characterTransparencyEnablers.Add(1));

			let accTransform: Transform | undefined;
			const weaponR = this.character.rig.handR.GetChild(2); // weapon.R
			for (let i = 0; i < weaponR.childCount; i++) {
				const t = weaponR.GetChild(i);
				if (t.gameObject.name === "BlockAcc") {
					accTransform = t;
				}
			}

			// Setup accessory
			if (accTransform !== undefined && this.itemDef.data?.block?.voxelName) {
				accTransform.gameObject.ClearChildren();

				const itemDef = this.itemStack.itemDef;
				const worldManager = WorldManager.Get();
				const blockId = worldManager.currentWorld.voxelBlocks.SearchForBlockIdByString(
					itemDef.data!.block!.voxelName,
				);
				const blockGo = MeshProcessor.ProduceSingleBlock(blockId, worldManager.currentWorld, 2, 1);
				if (blockGo) {
					blockGo.name = "BlockVisual";
					blockGo.transform.SetParent(accTransform);
					blockGo.SetLayerRecursive(this.character.rig.gameObject.layer);
					// copied from inspector
					blockGo.transform.localPosition = Vector3.zero;
					blockGo.transform.localScale = Vector3.one.mul(0.35);
					blockGo.transform.localRotation = Quaternion.identity;
					this.equippedBlockAcc = blockGo;
				}
			}

			this.bin.Add(
				BlockPlacementManager.Get().blockAddedNS.client.OnServerEvent((connId, blockPos, blockId) => {
					if (this.character.player?.connectionId !== connId) return;
					if (this.character === Game.localPlayer.character) return; // Don't re-play locally
					this.PlayPlaceEffect(blockPos);
				}),
			);

			const weaponRight = this.character.rig.handR.Find("weapon.R");
			for (let i = 0; i < weaponRight.GetChildCount(); i++) {
				const child = weaponRight.GetChild(i);
				this.clipReplacer = child.GetComponent<AnimatorClipReplacer>();
				if (this.clipReplacer) break;
			}
			this.clipReplacer?.ReplaceClips(this.character.animator);
		}

		if (this.isLocal) {
			this.bin.Add(
				Airship.Input.OnDown(ActionId.PlaceBlock).Connect(() => {
					this.TryPlaceBlock();
				}),
			);
		}

		this.aimRotation?.AimInfluence(this.aimRotation.generalInfluence, 1, this.tweenAimEntry);
		this.gameCharacter.LockCharacterRotation(true);
	}

	public SendPlaceBlock(): void {
		if (!this.blockId) return;

		const pos = this.GetPlacementPosition();
		if (!pos) return;

		const blockPlacement = BlockPlacementManager.Get();
		blockPlacement.ClientPredictBlockPlace(pos, this.blockId);
		blockPlacement.placeBlockNS.client.FireServer(pos, this.blockId);
	}

	public OnUnequip(): void {
		super.OnUnequip();
		if (this.equippedBlockAcc) {
			Destroy(this.equippedBlockAcc);
			this.equippedBlockAcc = undefined;
		}
		BlockPlacementManager.Get().selectionOutline.SetActive(false);
		// BlockPlacementManager.Get().blockPlacerIndicator.SetActive(false);
		this.aimRotation?.AimInfluence(this.aimRotation.generalInfluence, 0, this.tweenAimExit);
		this.gameCharacter.LockCharacterRotation(false);

		this.ResetTapPlacementState();
		this.ignoreTouchSet.clear();
	}

	protected UpdatePlacementPositionAndRefreshInidcators(dt: number): void {
		if (this.isLocal) {
			this.CalculatePlacementPosition();
			// this.RefreshIndicator();
			this.RefreshOutline();
		}
		this.KeepIdleDuringJump();
	}

	protected wasAirborne: boolean = false;
	private jumpDelayTask?: thread;

	public KeepIdleDuringJump(): void {
		const isAirborne = this.character.state === CharacterState.Airborne;

		if (isAirborne && !this.wasAirborne) {
			this.wasAirborne = true;
			//print("start jump");

			if (this.idleAnimation) {
				this.character.animationHelper.PlayAnimation(this.idleAnimation, CharacterAnimationLayer.OVERRIDE_1, 0);
			}

			if (this.jumpDelayTask) {
				task.cancel(this.jumpDelayTask);
				this.jumpDelayTask = undefined;
				//print("task canceled");
			}
		} else if (!isAirborne && this.wasAirborne) {
			this.wasAirborne = false;
			//print("grounded jump");

			this.jumpDelayTask = task.delay(0.39, () => {
				if (this.character.state === CharacterState.Airborne) return;

				this.character.animationHelper.StopAnimation(CharacterAnimationLayer.OVERRIDE_1, 0.4);
				//print("stop jump idle");

				this.jumpDelayTask = undefined;
			});
		}
	}

	public PlayPlaceEffect(blockPos: Vector3): void {
		this.character.animationHelper.PlayAnimation(
			this.blockPlaceAnimation,
			CharacterAnimationLayer.OVERRIDE_2,
			0.05,
		);

		BlockSoundManager.Get().PlayPlaceSound(this.itemStack.itemType as ItemType, blockPos);
	}

	protected TryPlaceBlock() {
		if (this.character.IsDead()) return;

		const placementPos = this.CalculatePlacementPosition(true);
		if (!placementPos) return;

		if (this.blockId !== undefined) {
			// const outstandingPredictions = BlockPredictionManager.Get().GetOutstandingPlacePredictions(this.blockId);
			// if (outstandingPredictions >= this.itemStack.amount) return;
		}

		this.SendPlaceBlock();
	}

	public ResetTapPlacementState() {
		this.placementPreviewBin.Clean();
		this.tapPlacementPosition = undefined;
		this.activePlacementTouchId = undefined;
		this.activeTouchScreenPosition = undefined;
	}

	/**
	 * Starts the tap placement preview that continuously updates based on the active touch position
	 */
	protected StartTapPlacementPreview(): void {
		this.placementPreviewBin.Clean();

		this.placementPreviewBin.Add(
			OnLateUpdate.Connect((dt) => {
				if (!this.activeTouchScreenPosition) return;

				const result = this.CalculateTapPlacementPosition(this.activeTouchScreenPosition);
				if (result) {
					this.tapPlacementPosition = result.placementPos;
					this.indicatorPosition = result.hitPoint;
				} else {
					this.tapPlacementPosition = undefined;
					this.indicatorPosition = undefined;
				}
			}),
		);
	}

	/**
	 * Calculates the placement position for a screen position raycast
	 * @returns Object with placement position and hit point, or undefined if no valid placement
	 */
	protected CalculateTapPlacementPosition(
		screenPosition: Vector2,
	): { placementPos: Vector3; hitPoint: Vector3 } | undefined {
		if (this.character.IsDead()) return;

		const camera = Airship.Camera.cameraRig!.mainCamera;
		const ray = camera.ScreenPointToRay(new Vector3(screenPosition.x, screenPosition.y, 0));

		// Calculate distance from camera to player to add to max block reach
		const cameraToPlayerDistance = ray.origin.sub(this.character.transform.position).magnitude;
		const adjustedMaxReach = BlockUtil.maxBlockReach + cameraToPlayerDistance;

		const [hit, hitPoint, hitNormal, collider] = Physics.Raycast(
			ray.origin,
			ray.direction,
			adjustedMaxReach,
			CacheManager.Get().voxelWorldLayerMask,
			QueryTriggerInteraction.Ignore,
		);

		if (!hit || !hitPoint) return;

		// Use eye position as starting point to match raycast validation seen in BlockUtil.RaycastForBlock()
		const crouchYOffset = this.character.movement.currentMoveSnapshot.isCrouching ? -0.6 : 0;
		const eyePosition = this.character.transform.position.add(new Vector3(0, 1.5 + crouchYOffset, 0));
		const sqrDistanceFromPlayer = hitPoint.sub(eyePosition).sqrMagnitude;
		if (sqrDistanceFromPlayer > BlockUtil.maxBlockReach * BlockUtil.maxBlockReach) {
			return;
		}

		// Offset the hit position by the normal to get the adjacent block position
		const blockPlacementPos = hitPoint.add(hitNormal.mul(0.1));
		const hitVoxelPos = BlockUtil.FloorPos(blockPlacementPos);

		if (!this.CanPlaceAt(hitVoxelPos)) {
			return;
		}

		const tapPlacementPos = this.GetCenterOfBlockAt(hitVoxelPos);
		return { placementPos: tapPlacementPos, hitPoint: hitPoint };
	}

	/**
	 * Handles mobile tap-based block placement by raycasting from tap position to voxel world
	 */
	protected TryPlaceAtTapPosition(screenPosition: Vector2) {
		this.placementPreviewBin.Clean();
		if (MobileUtil.IsTouchPositionOverUI(screenPosition)) return;

		const result = this.CalculateTapPlacementPosition(screenPosition);
		if (!result) return;

		this.indicatorPosition = result.hitPoint;
		this.tapPlacementPosition = result.placementPos;

		this.SendPlaceBlock();
	}

	/**
	 * Get the placement position. If we have a tap placement position for , use that instead of the normal placement position.
	 */
	public GetPlacementPosition() {
		if (this.tapPlacementPosition) {
			return this.tapPlacementPosition;
		}
		return this.placementPosition;
	}

	// public RefreshIndicator() {
	// 	const shouldRefreshIndicator = BlockPlacementManager.Get().IsBlockPlacerIndicatorEnabled();
	// 	if (!shouldRefreshIndicator) return;

	// 	const indicator = BlockPlacementManager.Get().blockPlacerIndicator;
	// 	if (!this.indicatorPosition) {
	// 		indicator.SetActive(false);
	// 		return;
	// 	}

	// 	indicator.SetActive(true);
	// 	indicator.transform.position = this.indicatorPosition;
	// }

	public RefreshOutline() {
		const selectionOutline = BlockPlacementManager.Get().selectionOutline;
		const placementPos = this.GetPlacementPosition();
		if (placementPos) {
			selectionOutline.SetActive(true);
			selectionOutline.transform.position = placementPos;
		} else {
			selectionOutline.SetActive(false);
		}
	}

	/**
	 * @param blockWillBePlacedHereNow If true we will update the last void placement time if void placement
	 * logic is used.
	 * @returns The next location to place a block at.
	 */
	private CalculatePlacementPosition(blockWillBePlacedHereNow = false): Vector3 | undefined {
		const localChar = Game.localPlayer.character;
		if (!localChar) {
			this.placementPosition = undefined;
			this.indicatorPosition = undefined;
			return;
		}

		const shouldTryRecordRecentVoidBridge = this.lastVoidPlacement !== this.lastRecordedVoidPlacement;
		const recentVoidBridge = os.clock() - this.lastVoidPlacement < 0.35;
		if (!recentVoidBridge) {
			this.voidPlacementStreak = 0;
		} else if (shouldTryRecordRecentVoidBridge) {
			this.voidPlacementStreak++;
			this.lastRecordedVoidPlacement = this.lastVoidPlacement;
		}

		const activelyVoidBridging = this.voidPlacementStreak >= 3;
		let checkVoidFirst = activelyVoidBridging;
		// Don't void bridge if we're looking down (trying to tower)
		if (checkVoidFirst) {
			const acos = math.acos(localChar.movement.currentMoveSnapshot.lookVector.y);
			const lookingDownAngle = 20;
			if (math.deg(acos) > 180 - lookingDownAngle) {
				checkVoidFirst = false;
			}
		}

		// refresh validation of last valid hook placement
		const lookDir = localChar.movement.GetLookVector();
		if (this.lastHookPlacementLookVector && this.lastHookPlacementPos) {
			// determines if player looked away from this area
			const lookDirAngleDot = lookDir.Dot(this.lastHookPlacementLookVector);
			// determines if player moved past this area i.e block is behind them
			const lookDirBlockPosDot = lookDir.Dot(this.lastHookPlacementPos.sub(localChar.transform.position));

			if (lookDirAngleDot < this.mainDotToKeepLastHookPlacement) {
				this.lastHookPlacementLookVector = undefined;
				this.lastHookPlacementPos = undefined;
			} else if (lookDirBlockPosDot < 0) {
				this.lastHookPlacementLookVector = undefined;
				this.lastHookPlacementPos = undefined;
			}
		} else {
			this.lastHookPlacementLookVector = undefined;
			this.lastHookPlacementPos = undefined;
		}

		// Prioritize raycast block check unless we're actively void bridging
		if (checkVoidFirst) {
			const voidPlacementResult = this.VoidPlacementCheck(blockWillBePlacedHereNow);
			if (voidPlacementResult) {
				this.lastHookPlacementPos = undefined;
				this.lastHookPlacementLookVector = undefined;

				this.placementPosition = voidPlacementResult;
				this.indicatorPosition = voidPlacementResult;
				return voidPlacementResult;
			}
			const raycastCheck = this.RaycastPlacementCheck();
			if (raycastCheck.result) {
				this.lastHookPlacementPos = undefined;
				this.lastHookPlacementLookVector = undefined;
				this.placementPosition = raycastCheck.result;
				this.indicatorPosition = raycastCheck.hitPosition;
				return raycastCheck.result;
			}
			const hookResult = this.HookPlacementCheck();
			if (hookResult) {
				this.lastHookPlacementPos = hookResult;
				this.lastHookPlacementLookVector = lookDir;
				this.placementPosition = hookResult;
				this.indicatorPosition = hookResult;
				return hookResult;
			}
			if (this.lastHookPlacementPos) {
				this.placementPosition = this.lastHookPlacementPos;
				this.indicatorPosition = this.lastHookPlacementLookVector;
				return this.lastHookPlacementPos;
			}

			this.placementPosition = undefined;
			this.indicatorPosition = undefined;
			return undefined;
		} else {
			const raycastCheck = this.RaycastPlacementCheck();
			if (raycastCheck.result) {
				this.lastHookPlacementPos = undefined;
				this.lastHookPlacementLookVector = undefined;
				this.placementPosition = raycastCheck.result;
				this.indicatorPosition = raycastCheck.hitPosition;
				return raycastCheck.result;
			}

			// Only do void placement if raycast didn't hit anything. If raycast does
			// hit something but the placement position is denied we should just do nothing.
			if (!raycastCheck.raycastHit) {
				const voidPlacementResult = this.VoidPlacementCheck(blockWillBePlacedHereNow);
				if (voidPlacementResult) {
					this.lastHookPlacementPos = undefined;
					this.lastHookPlacementLookVector = undefined;
					this.placementPosition = voidPlacementResult;
					this.indicatorPosition = voidPlacementResult;
					return voidPlacementResult;
				}
			}

			// const hookResult = this.HookPlacementCheck();
			// if (hookResult) {
			// 	this.lastHookPlacementPos = hookResult;
			// 	this.placementPosition = hookResult;
			// 	this.indicatorPosition = hookResult;
			// 	return hookResult;
			// }

			if (this.lastHookPlacementPos) {
				if (this.CanPlaceAt(this.lastHookPlacementPos)) {
					this.placementPosition = this.lastHookPlacementPos;
					this.indicatorPosition = this.lastHookPlacementLookVector;
					return this.lastHookPlacementPos;
				} else {
					this.lastHookPlacementPos = undefined;
				}
			}

			this.placementPosition = undefined;
			this.indicatorPosition = undefined;
			return undefined;
		}
	}

	/**
	 * The purpose of this check is to guess where someone intuitively means to place when they
	 * are trying to place on the side of a block in front of them that they aren't quite looking at
	 * directly.
	 *
	 * An image: (hopefully I remember to paste one)
	 */
	public HookPlacementCheck(): Vector3 | undefined {
		// const cameraRay = Airship.Camera.cameraRig!.mainCamera!.ViewportPointToRay(new Vector3(0.5, 0.5, 0));
		// const blockRaycast = new BlockRaycast(cameraRay.origin, cameraRay.direction);

		const localChar = Game.localPlayer.character;
		if (!localChar) return;

		const originPos = localChar.transform.position.add(new Vector3(0, 1.5, 0));
		const direction = localChar.movement.GetLookVector();
		const blockRaycast = new BlockRaycast(originPos, direction);

		const voxelWorld = WorldManager.Get().currentWorld;
		let pos: Vector3;

		// We check all possible hook positions but prioritize the one with the steepest hook angle
		// This gievs fairly intuitive results allowing you to pick which block to hook to
		let steepestHookPos: Vector3 | undefined;

		// Nothing shallower than 87 deg allowed
		// This number is arbitrary but the reasoning is hook placement is most useful beyond 90 deg
		// anywhere before that you can technically just look at the surface you want to place on and
		// hook placement can be annoying when you already have the ability to just naturally place somewhere
		const steepestHookAngle = math.cos(math.rad(87));
		let bestWeightedPriority = math.huge;
		while ((pos = blockRaycast.Next())) {
			const distFromPlayer = pos.sub(originPos).magnitude;
			if (distFromPlayer > BlockUtil.maxBlockReach) break; // Too far away!

			// const lastOffsetFromRay = blockRaycast.GetLastBlockOffsetFromRay();
			// if (lastOffsetFromRay > 0.5) continue;

			if (BlockUtil.VoxelDataToBlockId(voxelWorld.GetVoxelAt(pos)) !== 0) break;

			const halfCardinalDirs = [Vector3.up, Vector3.forward, Vector3.right];

			for (const card of halfCardinalDirs) {
				for (const mult of [-1, 1]) {
					const dir = card.mul(mult);
					// I only want dirs that are not really in the same direction as my ray...
					// You can see why here: https://imgur.com/a/5F1Fw8L
					// In that image, unlike what it is doing, I want it to select the end of the bridge
					// To make that distinction we avoid hooking to blocks that are relatively in the same
					// direction as our ray.
					const dp = dir.Dot(direction);
					if (dp > steepestHookAngle) continue;

					const currentWeightedPriority = math.abs(dp) + distFromPlayer * 0.25;
					if (currentWeightedPriority > bestWeightedPriority) continue;

					const blockPos = BlockUtil.FloorPos(pos).add(Vector3.one.div(2));
					if (
						BlockUtil.VoxelDataToBlockId(voxelWorld.GetVoxelAt(BlockUtil.FloorPos(pos.add(dir)))) > 0 &&
						this.CanPlaceAt(blockPos)
					) {
						steepestHookPos = blockPos;
						bestWeightedPriority = currentWeightedPriority;
					}
				}
			}
		}
		return steepestHookPos;
	}

	private RaycastPlacementCheck(): {
		result: Vector3 | undefined;
		raycastHit: boolean;
		hitPosition: Vector3 | undefined;
	} {
		const raycastResult = BlockUtil.RaycastForBlock();
		const blockPos = raycastResult?.point.add(raycastResult.normal.mul(0.1));
		if (blockPos && this.CanPlaceAt(blockPos)) {
			return { result: this.GetCenterOfBlockAt(blockPos), raycastHit: true, hitPosition: raycastResult?.point };
		}
		return { result: undefined, raycastHit: blockPos !== undefined, hitPosition: undefined };
	}

	private VoidPlacementCheck(blockWillBePlacedHereNow: boolean): Vector3 | undefined {
		const localChar = Game.localPlayer.character;
		if (!localChar) return;

		// const cameraRay = Camera.main.ViewportPointToRay(new Vector3(0.5, 0.5, 0));

		const charPos = localChar.transform.position;
		const posBelowChar = charPos.sub(new Vector3(0, 0.5, 0));
		// const cameraDir = cameraRay.direction.WithY(0);
		const blockRaycast = new BlockRaycast(
			posBelowChar.WithY(math.floor(posBelowChar.y) + 0.5),
			localChar.movement.GetLookVector().WithY(0),
		);
		for (let i = 0; i < BlockUtil.maxBlockReach; i++) {
			// This can be 0.51 because it is a 2D search (withY 0 above).
			const checkPos = blockRaycast.Next(0.51);
			if (checkPos.sub(charPos).magnitude > BlockUtil.maxBlockReach) break; // Too far!
			if (!this.CanPlaceAt(checkPos)) {
				// If we can't place at empty void location this no longer is a void bridge (so break)
				if (!WorldManager.Get().currentWorld.GetVoxelAt(checkPos)) break;
				continue;
			}
			if (blockWillBePlacedHereNow) this.lastVoidPlacement = os.clock();
			return this.GetCenterOfBlockAt(checkPos);
		}
	}

	private CanPlaceAt(pos: Vector3) {
		if (WorldManager.Get().currentWorld.GetVoxelAt(pos)) return false;

		const localPlayerPos = Game.localPlayer.character?.transform.position;
		if (localPlayerPos) {
			const itemData = this.GetItemData();
			const blockPos = BlockUtil.FloorPos(pos);
			// todo: map boundary
			// const inDenyRegion = DenyRegionManager.Get().IsContainedByRegion(blockPos);
			// if (inDenyRegion) {
			// 	return false;
			// }

			// const isOutsideMapBoundary = MapBoundaryManager.Get().IsOutsideMapBoundary(pos);
			// if (isOutsideMapBoundary) {
			// 	return false;
			// }

			const blockData = itemData?.block;
			if (blockData && (blockData.disallowPlaceOverVoid || blockData.disallowPlaceOverItemTypes)) {
				const belowPos = blockPos.sub(new Vector3(0, 1, 0));
				const blockBelow = WorldManager.Get().currentWorld.GetVoxelAt(belowPos);
				if (blockBelow === 0 && blockData.disallowPlaceOverVoid) {
					return false;
				}

				if (blockData.disallowPlaceOverItemTypes !== undefined) {
					const itemTypes = blockData.disallowPlaceOverItemTypes;
					for (const itemType of itemTypes) {
						if (blockBelow === ItemManager.Get().GetBlockIdFromItemType(itemType)) {
							return false;
						}
					}
				}
			}

			if (itemData?.block?.disallowPlaceOverVoid) {
				const belowPos = blockPos.sub(new Vector3(0, 1, 0));
				const blockBelow = WorldManager.Get().currentWorld.GetVoxelAt(belowPos);
				if (blockBelow === 0) {
					return false;
				}
			}

			const playerBlockPos = BlockUtil.FloorPos(localPlayerPos.add(new Vector3(0, 0.1, 0)));
			// This will push the player up, make sure it won't push them into a roof!
			if (playerBlockPos.sub(blockPos).magnitude < 0.01) {
				//Check 1 and 2 blocks above to handle the case of being surrounded by blocks and crouch jumping
				for (let i = 1; i < 3; i++) {
					const roofVoxelData = WorldManager.Get().currentWorld.GetVoxelAt(pos.add(new Vector3(0, i, 0)));
					// Does roof have collisions
					if (
						roofVoxelData > 0 &&
						WorldManager.Get().currentWorld.GetCollisionType(roofVoxelData) !== CollisionType.None
					) {
						return false;
					}
				}
			}

			// Make sure player isn't placing a block on their head
			if (playerBlockPos.add(new Vector3(0, 1, 0).sub(blockPos)).magnitude < 0.01) {
				return false;
			}
		}

		if (!BlockUtil.IsPositionAttachedToExistingBlock(pos)) return false; // Do this last, it is slowest!

		return true;
	}

	public GetCenterOfBlockAt(pos: Vector3): Vector3 {
		const floorPos = new Vector3(math.floor(pos.x), math.floor(pos.y), math.floor(pos.z));
		const centerPos = floorPos.add(Vector3.one.div(2));
		return centerPos;
	}

	public AppliesToItem(itemDef: ItemDef) {
		return itemDef.data?.block !== undefined;
	}
}
