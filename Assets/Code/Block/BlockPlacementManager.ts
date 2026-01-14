import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { ItemStack } from "@Easy/Core/Shared/Inventory/ItemStack";
import { NetworkFunction } from "@Easy/Core/Shared/Network/NetworkFunction";
import { NetworkSignal } from "@Easy/Core/Shared/Network/NetworkSignal";
import { Player } from "@Easy/Core/Shared/Player/Player";
import { MapUtil } from "@Easy/Core/Shared/Util/MapUtil";
import { Signal } from "@Easy/Core/Shared/Util/Signal";
import { ActionId } from "Code/Input/ActionId";
import ItemManager from "Code/Item/ItemManager";
import { ItemType } from "Code/Item/ItemType";
import LoadedWorld from "Code/World/LoadedWorld";
import WorldManager from "Code/World/WorldManager";
import { BlockBreakerItemHandler } from "./BlockBreakerItemHandler";
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
			worldNetId: number,
			placerConnId: number | undefined,
			worldPosition: Vector3,
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

	public placeBlockNetSig = new NetworkSignal<[pos: Vector3, blockId: number, worldNetId: number]>(
		"BlockPlacementManager:PlaceBlock",
	);
	public selectBlockNetFunc = new NetworkFunction<[itemType: ItemType], [slot: number | undefined]>(
		"BlockPlacementManager:SelectBlock",
	);

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
		this.placeBlockNetSig.server.OnClientEvent((player, pos, blockId, worldNetId) => {
			this.HandleClientBlockPlaceRequest(player, pos, blockId, worldNetId);
		});

		this.selectBlockNetFunc.server.SetCallback((player, itemType) => {
			if (!player.character) return undefined;

			const openSlot = player.character.inventory.GetFirstOpenSlot();
			let slotToUse = player.character.heldSlot;
			if (openSlot < 8) {
				slotToUse = openSlot;
			} else {
				// no room on hotbar so find first block
				for (let i = 0; i <= 8; i++) {
					const itemStack = player.character.inventory.GetItem(i);
					if (itemStack?.itemDef.data?.block) {
						slotToUse = i;
						break;
					}
				}
			}

			player.character.inventory.SetItem(slotToUse, new ItemStack(itemType));
			return slotToUse;
		});
	}

	public StartClient() {
		this.blockAddedNS.client.OnServerEvent((worldNetId, connectionId, worldPos, block, lastCommandId, extra) => {
			const world = WorldManager.Get().WaitForLoadedWorldFromNetId(worldNetId);
			const placer = connectionId ? Airship.Players.FindByConnectionId(connectionId) : undefined;
			this.onBlockPlace.Fire(new BlockPlaceEvent(worldPos, placer, block));
			if (!Game.IsHosting()) {
				if (extra?.d) {
					// Copy over health from predicted block damage
					const health = BlockDataManager.Get().GetBlockData(worldPos)?.h;
					extra.d.h = health;
					BlockDataManager.Get().RegisterBlockData(worldPos, extra.d);
				}

				// Require write for non-local writes or local writes where we have a bad local block
				const requiresWrite =
					connectionId !== Game.localPlayer.connectionId ||
					BlockUtil.VoxelDataToBlockId(world.voxelWorld.GetVoxelAt(worldPos.sub(world.offset))) !== block;

				if (requiresWrite) this.WriteVoxelAndContainedVoxels(world, worldPos, block, false, extra?.r);
			}
		});

		Airship.Input.OnDown(ActionId.SelectBlock).Connect((e) => {
			task.spawn(() => {
				if (!Game.localPlayer.character) return;
				const info = BlockBreakerItemHandler.GetTargetVoxelPositionAndRaycastInfo();
				if (info) {
					const voxelId = WorldManager.Get().currentWorld.GetVoxelIdAt(
						info.voxelWorldPosition.sub(WorldManager.Get().currentLoadedWorld.offset),
					);
					const itemType = ItemManager.Get().GetItemTypeFromVoxelId(voxelId);
					if (!itemType) return;

					// Look for existing on hotbar
					for (let i = 0; i <= 8; i++) {
						const itemStack = Game.localPlayer.character.inventory.GetItem(i);
						if (itemStack?.itemType === itemType) {
							Game.localPlayer.character.SetHeldSlot(i);
							return;
						}
					}

					const slot = this.selectBlockNetFunc.client.FireServer(itemType);
					if (slot !== undefined) {
						Game.localPlayer.character?.SetHeldSlot(slot);
					}
				}
			});
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

	public CanPlaceBlockAtPosition(
		player: Player,
		loadedWorld: LoadedWorld,
		worldPos: Vector3,
		blockId: number,
		logFailure = false,
	): boolean {
		const world = loadedWorld.voxelWorld;
		if (BlockUtil.VoxelDataToBlockId(world.GetVoxelAt(worldPos.sub(loadedWorld.offset))) !== 0) {
			// note: this will always happen in shared.
			if (logFailure) print(`Cannot place: inside existing block pos=${worldPos} blockId=${blockId}`);
			return false;
		}

		if (!loadedWorld.IsInWorldBounds(worldPos)) {
			if (logFailure) print("Cannot place: outside of world bounds.");
			return false;
		}

		if (!loadedWorld.HasBuildPermission(player)) {
			if (logFailure) print("Cannot place: no permission.");
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
			const belowPos = worldPos.sub(new Vector3(0, 1, 0));
			const blockBelow = loadedWorld.voxelWorld.GetVoxelAt(belowPos.sub(loadedWorld.offset));
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

		if (!BlockUtil.IsPositionAttachedToExistingBlock(loadedWorld.voxelWorld, worldPos.sub(loadedWorld.offset))) {
			if (logFailure) print("Cannot place: not attached to block");
			return false;
		}
		return true;
	}

	public HandleClientBlockPlaceRequest(player: Player, worldPos: Vector3, blockId: number, worldNetId: number) {
		const loadedWorld = WorldManager.Get().WaitForLoadedWorldFromNetId(worldNetId);
		const voxelWorld = loadedWorld.voxelWorld;

		worldPos = BlockUtil.FloorPos(worldPos);

		if (!this.CanPlaceBlockAtPosition(player, loadedWorld, worldPos, blockId, false)) {
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

		const heldBlockId = voxelWorld.voxelBlocks.GetBlockIdFromStringId(blockType);
		if (blockId !== heldBlockId) {
			print("Cannot place: requested to place different block then in hand");
			return false;
		}

		const event = this.onBlockPlace.Fire(new BlockPlaceEvent(worldPos, player, blockId));
		if (event.IsCancelled()) {
			print("Cannot place: onBlockPlace event cancelled");
			return false;
		}

		// Do this last -- it consumes the held item
		// if (!InventoryUtil.TryConsumeHeldItem(player, heldItem.itemType as ItemType)) {
		// 	print("Cannot place: failed to consume inventory item");
		// 	return false;
		// }

		this.SpawnBlockServer(loadedWorld, worldPos, blockId, player, GetBlockData({ breakable: true }), undefined);
		return true;
	}

	public ClientPredictBlockPlace(voxelPos: Vector3, blockId: number): (() => void) | undefined {
		WorldManager.Get().currentWorld.WriteVoxelAt(voxelPos, blockId, true);
		// Predict block data of breakable. This could be made a more precise prediciton if needed (for example predicting redirect)
		BlockDataManager.Get().RegisterBlockData(voxelPos, GetBlockData({ breakable: true })!);

		const flooredPos = BlockUtil.FloorPos(voxelPos);
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
		loadedWorld: LoadedWorld,
		position: Vector3,
		blockId: number,
		placer?: Player,
		blockData?: BlockData,
		rotation?: Quaternion,
	) {
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
				loadedWorld.networkIdentity.netId,
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

		this.WriteVoxelAndContainedVoxels(loadedWorld, position, blockId, true, rotation);
	}

	public WriteVoxelAndContainedVoxels(
		world: LoadedWorld,
		worldPos: Vector3,
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

		world.voxelWorld.WriteVoxelAt(worldPos.sub(world.offset), voxelData, priority);

		const blockItem = ItemManager.Get().GetItemTypeFromVoxelId(BlockUtil.VoxelDataToBlockId(voxelData));
		if (blockItem) {
			const containedVoxels = BlockUtil.GetContainedVoxels(blockItem, worldPos, rotation ?? Quaternion.identity);
			for (const v of containedVoxels) {
				if (v.sub(worldPos).magnitude < 0.001) continue; // Don't create a redirect block at root

				world.voxelWorld.WriteVoxelAt(v.sub(world.offset), this.redirectId, priority);
				const blockData = GetBlockData({ breakable: true, redirect: worldPos });
				if (blockData) {
					BlockDataManager.Get().RegisterBlockData(v, blockData);
				}
			}
		}
	}
}
