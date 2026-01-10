import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { SignalPriority } from "@Easy/Core/Shared/Util/Signal";
import { OnLateUpdate } from "@Easy/Core/Shared/Util/Timer";
import { ActionId } from "Code/Input/ActionId";
import { ItemType } from "Code/Item/ItemType";
import ItemHandler from "Code/ItemHandler/ItemHandler";
import WorldManager from "Code/World/WorldManager";
import BlockDataManager from "./BlockDataManager";
import BlockHitManager from "./BlockHitManager";
import BlockPlacementManager from "./BlockPlacementManager";
import { BlockRaycastResult, BlockUtil } from "./BlockUtil";

export default class BlockBreakerItemReferences extends AirshipSingleton {
	public idleAnimation: AnimationClip;

	// public sparkVfx?: GameObject;
	// public debrisVfx?: GameObject;
	// public negatedDebrisVfx?: GameObject;
	// public destroyedVfx?: GameObject;

	public clipReplacer: AnimatorClipReplacer;
	public equipAnimation: AnimationClip;
}

const requiredEquipTime = 0.15;

export class BlockBreakerItemHandler extends ItemHandler {
	private equipTime = 0;
	private aimDisableDelay = 0.6;

	constructor() {
		super();
		this.itemTypes = [ItemType.EmeraldPickaxe];
		this.tweenAimEntry = 0.2;
	}

	public OnInit(): void {
		super.OnInit();

		const refs = BlockBreakerItemReferences.Get();
		this.idleAnimation = refs.idleAnimation;
		this.clipReplacer = refs.clipReplacer;
		this.equipAnimation = refs.equipAnimation;
	}

	public OnEquip(): void {
		super.OnEquip();
		if (this.isLocal) {
			// this.bin.Add(HudControlsManager.Get().AddHudControlDisplay(HudControlDisplay.Mine));

			this.bin.Add(
				OnLateUpdate.ConnectWithPriority(SignalPriority.MONITOR, (dt) => {
					this.BlockBreakerUpdate(dt);
				}),
			);
		}
		this.equipTime = Time.time;
	}

	public OnUnequip(): void {
		super.OnUnequip();
		BlockPlacementManager.Get().selectionOutline.SetActive(false);
	}

	protected BlockBreakerUpdate(dt: number): void {
		// Only tick on local client when equipped
		if (
			!Game.IsClient() ||
			!this.equipped ||
			this.character !== Game.localPlayer.character ||
			this.character.IsDead()
		) {
			return;
		}

		// Get a valid block target character is aiming at
		const targetInfo = this.GetTargetVoxelPositionAndRaycastInfo();
		if (targetInfo) {
			//Position the selection outline around our target
			const selectionOutline = BlockPlacementManager.Get().selectionOutline;
			selectionOutline.SetActive(true);
			selectionOutline.transform.position = targetInfo.voxelPosition.add(Vector3.one.div(2));
		} else {
			// if (BlockPlacement.Get().getBlockPlacerIndicatorEnabled()) {
			// 	BlockPlacement.Get().selectionOutline.SetActive(false);
			// }
			// BlockPlacement.Get().blockPlacerIndicator.SetActive(false);
		}

		// Do we want to use this item?
		if (
			Airship.Input.IsDown(ActionId.BreakBlock) &&
			Time.time > this.equipTime + requiredEquipTime &&
			BlockHitManager.Get().ValidateActionCooldown(
				this.character.player,
				this.character.movement.currentMoveSnapshot.tick,
				true,
				false,
			)
		) {
			// Start the prediction command
			task.spawn(() => {
				this.SendBlockHit();
			});
		}
	}

	public SendBlockHit() {
		// Lock look direction while swinging
		this.aimRotation?.AimInfluence(this.aimRotation.generalInfluence, 1, this.tweenAimEntry);
		this.gameCharacter.LockCharacterRotation(true);
		task.delay(this.aimDisableDelay, () => {
			this.aimRotation?.AimInfluence(this.aimRotation.generalInfluence, 0, this.tweenAimExit);
			this.gameCharacter.LockCharacterRotation(false);
		});

		const info = this.GetTargetVoxelPositionAndRaycastInfo();
		if (info) {
			BlockHitManager.Get().hitBlockNetSig.client.FireServer(
				info.voxelPosition,
				info.raycastResult.point,
				info.raycastResult.normal,
			);

			const blockId = WorldManager.Get().currentWorld.GetVoxelAt(info.voxelPosition);
			BlockHitManager.Get().PlayHitEffect(
				this.character,
				info.voxelPosition,
				info.raycastResult.point,
				info.raycastResult.normal,
				blockId,
				false,
				true,
			);
		}
	}

	public GetPrioritySuffocationBlock() {
		// head first, then body
		const orderedPositionsToCheck = [
			this.character.transform.position.add(new Vector3(0, 1.5, 0)),
			this.character.transform.position.add(new Vector3(0, 0.5, 0)),
		];
		for (const pos of orderedPositionsToCheck) {
			const voxelPosition = new Vector3(math.floor(pos.x), math.floor(pos.y), math.floor(pos.z));
			const existingBlock = BlockUtil.VoxelDataToBlockId(
				WorldManager.Get().currentWorld.ReadVoxelAt(voxelPosition),
			);
			const isPlacedBlock = existingBlock && BlockDataManager.Get().GetBlockData(voxelPosition) !== undefined;

			if (isPlacedBlock) {
				return {
					voxelPosition,
					raycastResult: { point: voxelPosition.add(new Vector3(0.5, 0.5, 0.5)), normal: Vector3.down },
				};
			}
		}
	}

	public GetTargetVoxelPositionAndRaycastInfo():
		| { voxelPosition: Vector3; raycastResult: BlockRaycastResult }
		| undefined {
		const raycastResult = BlockUtil.RaycastForBlock();
		const hitBlockPos = raycastResult?.point.sub(raycastResult.normal.mul(0.1));
		if (!raycastResult || !hitBlockPos) {
			return;
		}

		// if (raycastResult.point) {
		// 	indicator.SetActive(true);
		// 	indicator.transform.position = raycastResult.point;
		// }
		const voxelPosition = new Vector3(
			math.floor(hitBlockPos.x),
			math.floor(hitBlockPos.y),
			math.floor(hitBlockPos.z),
		);
		return { voxelPosition: voxelPosition, raycastResult };
	}
}
