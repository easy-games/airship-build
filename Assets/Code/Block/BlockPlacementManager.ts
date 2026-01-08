import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { MapUtil } from "@Easy/Core/Shared/Util/MapUtil";
import { Signal } from "@Easy/Core/Shared/Util/Signal";
import ItemManager from "Code/Item/ItemManager";
import WorldManager from "Code/World/WorldManager";
import BlockDataManager, { BlockData, GetBlockData } from "./BlockDataManager";
import BlockPredictionManager, { VoxelUpdatePredictionType } from "./BlockPredictionManager";
import { BlockUtil } from "./BlockUtil";
import { BlockPlaceEvent } from "./Event/BlockPlaceEvent";

interface BlockAddedExtraDto {
	/** Block data */
	d?: BlockData;
	/** Rotation quaternion */
	r?: Quaternion;
}

/** Max block placements per second per player. This is evaluated on a 0.5s sliding window (so no more than half of this every 0.5s) */
export const MAX_BLOCKS_PER_SECOND = 14;

export default class BlockPlacementManager extends AirshipSingleton {
	public maxVoidBridgeLen = 6;
	public redirectId: number;
	/** lastCommandId is used to map the block placement to this client's timeline */
	public blockAddedNS = new NetworkSignal<
		[
			placerConnId: number | undefined,
			position: Vector3,
			block: number,
			lastCommandId: number | undefined,
			extra?: BlockAddedExtraDto,
		]
	>("BlockAdded");
	public onBlockPlace = new Signal<BlockPlaceEvent>();
	public selectionOutline: GameObject;
	// public blockPlacerIndicator: GameObject;
	// private blockPlacerIndicatorEnabled = true;
	/** Map form player to timestamps of recent block placements. Used for CPS cap */
	private lastPlacementTick = new Map<Player, number>();
	@NonSerialized()
	public localTimeSinceLastPlacement = 0;
	@NonSerialized()
	public isLocalBlockQueued = false;

	public placeBlockNS = new NetworkSignal<[pos: Vector3, blockId: number]>("BlockPlacementManager:PlaceBlock");

	override Start(): void {
		if (Game.IsClient()) this.StartClient();
		if (Game.IsServer()) this.StartServer();

		task.spawn(() => {
			WorldManager.Get().WaitForWorldLoaded();
			this.redirectId =
				WorldManager.Get().currentWorld.voxelBlocks.GetBlockIdFromStringId("@Easy/VoxelWorld:Redirect");
		});

		// const blockBuildBreakCrosshairSetting = "Block Build/Break Crosshair Enabled";
		// Airship.Settings.AddToggle(blockBuildBreakCrosshairSetting, true);
		// Airship.Settings.ObserveToggle(blockBuildBreakCrosshairSetting, (isEnabled) => {
		// 	this.blockPlacerIndicator.SetActive(false);
		// 	this.blockPlacerIndicatorEnabled = isEnabled;
		// });
	}

	public IsBlockPlacerIndicatorEnabled(): boolean {
		return false;
		// return this.blockPlacerIndicatorEnabled;
	}

	public StartServer() {
		this.placeBlockNS.server.OnClientEvent((player, pos, blockId) => {
			this.HandleClientBlockPlaceRequest(player, pos, blockId);
		});
	}

	public StartClient() {
		this.blockAddedNS.client.OnServerEvent((connectionId, position, block, lastCommandId, extra) => {
			const placer = connectionId ? Airship.Players.FindByConnectionId(connectionId) : undefined;
			this.onBlockPlace.Fire(new BlockPlaceEvent(position, placer, block));
			if (!Game.IsHosting()) {
				if (extra?.d) {
					// Copy over health from predicted block damage
					const health = BlockDataManager.Get().GetBlockData(position)?.h;
					extra.d.h = health;
					BlockDataManager.Get().RegisterBlockData(position, extra.d);
				}

				// Require write for non-local writes or local writes where we have a bad local block
				const requiresWrite =
					connectionId !== Game.localPlayer.connectionId ||
					BlockUtil.VoxelDataToBlockId(WorldManager.Get().currentWorld.GetVoxelAt(position)) !== block;

				if (requiresWrite) this.WriteVoxelAndContainedVoxels(position, block, false, extra?.r);
			}
		});
	}

	/**
	 * Validates wether a place can go through. If this returns true it will register the placement to
	 * the CPS list (as long as registerNewPlacement is true).
	 * @returns True if place can go through
	 */
	public ValidateCps(player: Player, tick: number, registerNewPlacement: boolean, queuePlacement: boolean) {
		const lastPlacementTick = MapUtil.GetOrCreate(this.lastPlacementTick, player, 0);

		const cooldown = 1 / MAX_BLOCKS_PER_SECOND;
		const elapsedTime = (tick - lastPlacementTick) * Time.fixedDeltaTime;

		let shouldQueue = false;
		if (player.IsLocalPlayer() && queuePlacement) {
			shouldQueue = elapsedTime >= cooldown * 0.5 && !this.isLocalBlockQueued;
		}
		if (elapsedTime >= cooldown) {
			if (registerNewPlacement) {
				this.lastPlacementTick.set(player, tick);
				if (player.IsLocalPlayer()) {
					this.localTimeSinceLastPlacement = 0;
				}
			}
			return true;
		}

		if (shouldQueue && player.IsLocalPlayer()) {
			this.isLocalBlockQueued = shouldQueue;
		}
		return false;
	}

	public CanPlaceBlockAtPosition(position: Vector3, blockId: number, logFailure = false): boolean {
		const world = WorldManager.Get().currentWorld;
		if (BlockUtil.VoxelDataToBlockId(world.GetVoxelAt(position)) !== 0) {
			if (logFailure) print(`Cannot place: inside existing block pos=${position} blockId=${blockId}`);
			return false;
		}

		const itemData = ItemManager.Get().GetItemDataFromVoxelData(blockId);
		const blockData = itemData?.block;

		// todo: boundary checks
		// if (!itemData?.blockAllowPlaceAnywhere) {
		// 	const inDenyRegion = DenyRegionManager.Get().IsContainedByRegion(position);
		// 	if (inDenyRegion) {
		// 		if (logFailure) print("Cannot place: inside deny region");
		// 		return false;
		// 	}

		// 	const isOutsideMapBoundary = MapBoundaryManager.Get().IsOutsideMapBoundary(position);
		// 	if (isOutsideMapBoundary) {
		// 		if (logFailure) print("Cannot place: outside map boundary");
		// 		return false;
		// 	}
		// }

		if (blockData && (blockData.disallowPlaceOverVoid || blockData.disallowPlaceOverItemTypes)) {
			const belowPos = position.sub(new Vector3(0, 1, 0));
			const blockBelow = WorldManager.Get().currentWorld.GetVoxelAt(belowPos);
			if (blockBelow === 0 && blockData.disallowPlaceOverVoid) {
				if (logFailure) print("Cannot place: place over void");
				return false;
			}

			if (blockData.disallowPlaceOverItemTypes !== undefined) {
				const itemTypes = blockData.disallowPlaceOverItemTypes;
				for (const itemType of itemTypes) {
					if (blockBelow === ItemManager.Get().GetBlockIdFromItemType(itemType)) {
						if (logFailure) print("Cannot place: not supportive");
						return false;
					}
				}
			}
		}

		if (!BlockUtil.IsPositionAttachedToExistingBlock(position)) {
			if (logFailure) print("Cannot place: not attached to block");
			return false;
		}
		return true;
	}

	public HandleClientBlockPlaceRequest(player: Player, position: Vector3, blockId: number) {
		position = BlockUtil.FloorPos(position);

		if (!this.CanPlaceBlockAtPosition(position, blockId, true)) {
			return false;
		}

		const character = player.character;
		if (!character) {
			print("Cannot place: no character");
			return false;
		}

		const heldItem = character.GetHeldItem();
		if (heldItem === undefined) {
			print("Cannot place: no held item");
			return false;
		}

		const blockType = heldItem.itemDef.data?.block?.voxelName;
		if (!blockType) {
			print("Cannot place: not holding a voxel block");
			return false;
		}

		const heldBlockId = WorldManager.Get().currentWorld.voxelBlocks.GetBlockIdFromStringId(blockType);
		if (blockId !== heldBlockId) {
			print("Cannot place: requested to place different block then in hand");
			return false;
		}

		const event = this.onBlockPlace.Fire(new BlockPlaceEvent(position, player, blockId));
		if (event.IsCancelled()) {
			print("Cannot place: onBlockPlace event cancelled");
			return false;
		}

		// Do this last -- it consumes the held item
		// if (!InventoryUtil.TryConsumeHeldItem(player, heldItem.itemType as ItemType)) {
		// 	print("Cannot place: failed to consume inventory item");
		// 	return false;
		// }

		this.SpawnBlockServer(position, blockId, player, GetBlockData({ breakable: true }), undefined);
		return true;
	}

	public ClientPredictBlockPlace(placementPos: Vector3, blockId: number): (() => void) | undefined {
		WorldManager.Get().currentWorld.WriteVoxelAt(placementPos, blockId, true);
		// Predict block data of breakable. This could be made a more precise prediciton if needed (for example predicting redirect)
		BlockDataManager.Get().RegisterBlockData(placementPos, GetBlockData({ breakable: true })!);

		const flooredPos = BlockUtil.FloorPos(placementPos);
		const undoPrediction = BlockPredictionManager.Get().RegisterPrediction({
			position: flooredPos,
			predictionType: VoxelUpdatePredictionType.PlaceBlock,
			blockId,
		});
		return undoPrediction;
	}

	/**
	 * @param fromCmdId This should only be included when block is spawned from BlockPlaceCmd
	 */
	public SpawnBlockServer(
		position: Vector3,
		blockId: number,
		placer?: Player,
		blockData?: BlockData,
		rotation?: Quaternion,
	) {
		WorldManager.Get().WaitForWorldLoaded();

		position = BlockUtil.FloorPos(position);
		if (!Game.IsServer()) {
			warn("Cannot call SpawnBlockServer from client.");
			return;
		}

		if (blockData && placer) {
			blockData.p = placer.userId.hash();
		}

		// Send to all clients individually to include their last command for timing purposes
		for (const player of Airship.Players.GetPlayers()) {
			this.blockAddedNS.server.FireClient(
				player,
				placer?.connectionId,
				position,
				blockId,
				player.character?.movement.currentMoveSnapshot.lastProcessedCommand,
				{
					d: blockData,
					r: rotation,
				},
			);
		}

		if (blockData) {
			BlockDataManager.Get().RegisterBlockData(position, blockData, true);
		}

		this.WriteVoxelAndContainedVoxels(position, blockId, true, rotation);
	}

	public WriteVoxelAndContainedVoxels(
		position: Vector3,
		voxelData: number,
		priority: boolean,
		rotation?: Quaternion,
	) {
		if (rotation) {
			const flip = BlockUtil.QuaternionToFlipBits(rotation);
			voxelData = BlockUtil.SetVoxelFlippedBits(voxelData, flip);
		} else {
			// If no rotation is supplied it may be passed through the existing voxel data
			rotation = BlockUtil.FlipBitsToQuaternion(BlockUtil.GetVoxelFlippedBits(voxelData));
		}

		WorldManager.Get().currentWorld.WriteVoxelAt(position, voxelData, priority);

		const blockItem = ItemManager.Get().GetItemTypeFromVoxelId(BlockUtil.VoxelDataToBlockId(voxelData));
		if (blockItem) {
			const containedVoxels = BlockUtil.GetContainedVoxels(blockItem, position, rotation ?? Quaternion.identity);
			for (const v of containedVoxels) {
				if (v.sub(position).magnitude < 0.001) continue; // Don't create a redirect block at root

				WorldManager.Get().currentWorld.WriteVoxelAt(v, this.redirectId, priority);
				const blockData = GetBlockData({ breakable: true, redirect: position });
				if (blockData) {
					BlockDataManager.Get().RegisterBlockData(v, blockData);
				}
			}
		}
	}
}
