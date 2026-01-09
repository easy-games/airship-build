import { Airship } from "@Easy/Core/Shared/Airship";
import { Game } from "@Easy/Core/Shared/Game";
import { SettingId } from "Code/Input/SettingId";
import { ItemType } from "Code/Item/ItemType";
import CacheManager from "Code/Misc/CacheManager";
import WorldManager from "Code/World/WorldManager";
import BlockDataManager from "./BlockDataManager";

export const BLOCK_SIZE = 1;

export interface BlockRaycastResult {
	point: Vector3;
	normal: Vector3;
}

export class BlockUtil {
	public static maxBlockReach = 8;
	/** A block can only be placed if a block in one of these relative positions exists */
	private static requiredNeighborForPlacement: Vector3[] = [
		// +
		new Vector3(0, 0, 1),
		new Vector3(0, 0, -1),
		new Vector3(1, 0, 0),
		new Vector3(-1, 0, 0),
		new Vector3(0, 1, 0),
		new Vector3(0, -1, 0),

		// and corners
		new Vector3(-1, 0, -1),
		new Vector3(1, 0, -1),
		new Vector3(-1, 0, 1),
		new Vector3(1, 0, 1),
	];

	/** For far away from camera can you place a block */
	public static GetBlockReach() {
		return this.maxBlockReach;
	}

	public static RaycastForBlock(): BlockRaycastResult | undefined {
		const localChar = Game.localPlayer.character;
		if (!localChar) return;

		let originPos: Vector3;
		let direction: Vector3;
		if (Airship.Settings.GetToggle(SettingId.BW2_Placement)) {
			const crouchYOffset = localChar.movement.currentMoveSnapshot.isCrouching ? -0.6 : 0;
			originPos = localChar.transform.position.add(new Vector3(0, 1.5 + crouchYOffset, 0));
			direction = localChar.movement.GetLookVector();
		} else {
			originPos = CacheManager.Get().mainCameraPosition;
			direction = Camera.main.transform.forward;
		}

		// const cameraRay = CameraReferences.mainCamera!.ViewportPointToRay(new Vector3(0.5, 0.5, 0));
		const dist = this.GetBlockReach();
		const layer = CacheManager.Get().voxelWorldLayerMask;
		const [hit, point, normal, collider] = Physics.Raycast(originPos, direction, dist, layer);
		if (hit) {
			return { point, normal };
		}
	}

	public static FloorPos(pos: Vector3) {
		return new Vector3(math.floor(pos.x), math.floor(pos.y), math.floor(pos.z));
	}

	public static RoundPos(pos: Vector3) {
		return new Vector3(math.round(pos.x), math.round(pos.y), math.round(pos.z));
	}

	/** Matches VoxelWorld function, just without the bridge call */
	public static VoxelDataToBlockId(data: number): number {
		return data & 0xfff;
	}

	/** VoxelWorld function to convert a quaternion to relevant flip enum. Must be passed to {@link SetVoxelFlippedBits} to apply */
	public static QuaternionToFlipBits(quat: Quaternion): number {
		const euler = quat.eulerAngles;

		let flipNum = 0;
		const yAngle = euler.y % 360;
		// Find primary direction of quaternion
		if (yAngle <= 45 || yAngle > 315) flipNum = 0;
		if (yAngle > 45 && yAngle <= 135) flipNum = 1;
		if (yAngle > 135 && yAngle <= 225) flipNum = 2;
		if (yAngle > 225 && yAngle <= 315) flipNum = 3;

		// Determine if quaternion is flipped over
		if (math.abs((euler.z % 360) - 180) < 90) {
			flipNum += 4;
		}

		return flipNum;
	}

	/**
	 * Matches VoxelWorld.FlipBitsToQuaternion. Takes flip bits as input and returns the corresponding
	 * quaternion.
	 */
	public static FlipBitsToQuaternion(flipBits: number): Quaternion {
		switch (flipBits) {
			case 0:
				return Quaternion.identity;
			case 1:
				return Quaternion.Euler(0, 90, 0);
			case 2:
				return Quaternion.Euler(0, 180, 0);
			case 3:
				return Quaternion.Euler(0, 270, 0);
			case 4:
				return Quaternion.Euler(0, 0, 180);
			case 5:
				return Quaternion.Euler(0, 90, 180);
			case 6:
				return Quaternion.Euler(0, 180, 180);
			case 7:
				return Quaternion.Euler(0, 270, 180);
		}
		return Quaternion.identity;
	}

	/** Matches VoxelWorld function, just without the bridge call */
	public static SetVoxelFlippedBits(voxel: number, flippedBits: number): number {
		// Ensure flippedBits is a 3-bit value (0-7)
		flippedBits &= 0x7;

		// Clear the 12th, 13th, and 14th bits in the original voxel
		voxel &= ~0x7000;

		// Set the 12th, 13th, and 14th bits using the flippedBits
		voxel |= flippedBits << 12;
		return voxel;
	}

	/** Gets the flipped bits from voxel data */
	public static GetVoxelFlippedBits(voxel: number): number {
		return (voxel >> 12) & 0x7;
	}

	public static HasContainedVoxels(itemType: ItemType) {
		const size = Airship.Inventory.GetItemDef(itemType).data?.block?.size;
		return size !== undefined && (size.x > 1 || size.y > 1 || size.z > 1);
	}

	/** Returns a list of contained voxels for blocks which occupy multiple voxels (such as a bed) */
	public static GetContainedVoxels(itemType: ItemType, position: Vector3, rotation: Quaternion) {
		const size = Airship.Inventory.GetItemDef(itemType).data?.block?.size ?? Vector3.zero;
		const rotatedSize = rotation.mul(size);
		const containedVoxels: Vector3[] = [];
		for (let x = 0; x < math.max(math.abs(math.round(rotatedSize.x)), 1); x++) {
			for (let y = 0; y < math.max(math.abs(math.round(rotatedSize.y)), 1); y++) {
				for (let z = 0; z < math.max(math.abs(math.round(rotatedSize.z)), 1); z++) {
					const offset = new Vector3(
						x * math.sign(rotatedSize.x),
						y * math.sign(rotatedSize.y),
						z * math.sign(rotatedSize.z),
					);
					containedVoxels.push(position.add(offset));
				}
			}
		}
		return containedVoxels;
	}

	/**
	 * Resolves block redirection (for example a bed's foot is a redirect
	 * voxel that points to the head, when the foot is passed in the head
	 * position is returned. The head of the bed [aka root of the block] is
	 * where health / other data is stored).
	 */
	public static GetRedirectedBlockPosition(blockPos: Vector3) {
		const blockData = BlockDataManager.Get().GetBlockData(blockPos);
		return blockData?.r ?? blockPos;
	}

	/**
	 * Returns true if a block can be placed at the passed in position (it
	 * is attached to an existing block).
	 */
	public static IsPositionAttachedToExistingBlock(position: Vector3): boolean {
		// This is slow! It'd be nice to swap this to a single bulk bridge call
		const vw = WorldManager.Get().currentWorld;
		for (const supportPos of this.requiredNeighborForPlacement) {
			if (vw.ReadVoxelAt(position.add(supportPos)) > 0) return true;
		}
		return false;
	}

	public static IsLevelBlock(position: Vector3) {
		const existingBlock = BlockUtil.VoxelDataToBlockId(WorldManager.Get().currentWorld.ReadVoxelAt(position));
		if (existingBlock === 0) return false;

		return BlockDataManager.Get().GetBlockData(position) === undefined;
	}
}
