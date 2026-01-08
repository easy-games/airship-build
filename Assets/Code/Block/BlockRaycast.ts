import { BlockUtil } from "./BlockUtil";

export class BlockRaycast {
	private iterationsWithoutBlock = 0;
	private currX = 0;
	private currY = 0;
	private currZ = 0;

	private dhdx: number;
	private dhdy: number;
	private dhdz: number;

	private xDir: number;
	private yDir: number;
	private zDir: number;

	private normalizedDir: Vector3;

	private currentBlock: Vector3;
	private offsetFromBlock: Vector3;
	private lastBlockOffsetFromRay = 0;

	constructor(public center: Vector3, dir: Vector3) {
		// GizmoUtils.DrawSingleLine(center, center.add(dir.mul(5)), Color.red, 0.5);
		this.normalizedDir = dir.normalized;
		// This algo comes from https://www.youtube.com/watch?v=NbSee-XM7WA&ab_channel=javidx9 (DDA)
		this.currentBlock = BlockUtil.FloorPos(center);
		this.offsetFromBlock = center.sub(this.currentBlock);
		this.dhdx = dir.x === 0 ? math.huge : math.sqrt(1 + math.pow(dir.y / dir.x, 2) + math.pow(dir.z / dir.x, 2));
		this.dhdy = dir.y === 0 ? math.huge : math.sqrt(1 + math.pow(dir.x / dir.y, 2) + math.pow(dir.z / dir.y, 2));
		this.dhdz = dir.z === 0 ? math.huge : math.sqrt(1 + math.pow(dir.x / dir.z, 2) + math.pow(dir.y / dir.z, 2));

		this.xDir = dir.x < 0 ? -1 : 1;
		this.yDir = dir.y < 0 ? -1 : 1;
		this.zDir = dir.z < 0 ? -1 : 1;

		let offsetFromMinDirection = this.offsetFromBlock;
		if (dir.x < 0) offsetFromMinDirection = offsetFromMinDirection.WithX(1 - offsetFromMinDirection.x);
		if (dir.y < 0) offsetFromMinDirection = offsetFromMinDirection.WithY(1 - offsetFromMinDirection.y);
		if (dir.z < 0) offsetFromMinDirection = offsetFromMinDirection.WithZ(1 - offsetFromMinDirection.z);
		this.currX = dir.x === 0 ? 0 : -1 * offsetFromMinDirection.x * this.dhdx;
		this.currY = dir.y === 0 ? 0 : -1 * offsetFromMinDirection.y * this.dhdy;
		this.currZ = dir.z === 0 ? 0 : -1 * offsetFromMinDirection.z * this.dhdz;
	}

	/**
	 * Iterates the raycast forward 1 block and returns it.
	 *
	 * @param skipBlocksByDistFromRay Skips blocks that have a center at or beyond this
	 * distance from the ray. This applies in 3D, but a rough idea of what
	 * this means: https://i.imgur.com/OZ1i8YZ.png (an example param that would achieve that image
	 * could be 0.6). Added for diagonal void bridging where you might not need to place a block
	 * at every intersecting position. Should be greater than sqrt(2) to guarantee results (I think).
	 */
	public Next(skipBlocksByDistFromRay?: number): Vector3 {
		// This should never occur if input is sqrt(2) or greater.
		if (this.iterationsWithoutBlock > 3) {
			error("Failed to find a block along ray with specified skipBlocksByDistFromRay.");
		}
		const nextXDist = this.currX + this.dhdx;
		const nextYDist = this.currY + this.dhdy;
		const nextZDist = this.currZ + this.dhdz;

		// Step x
		if (nextXDist < nextYDist && nextXDist < nextZDist) {
			this.currX = nextXDist;
			this.currentBlock = this.currentBlock.add(new Vector3(this.xDir, 0, 0));
			// Step y
		} else if (nextYDist < nextXDist && nextYDist < nextZDist) {
			this.currY = nextYDist;
			this.currentBlock = this.currentBlock.add(new Vector3(0, this.yDir, 0));
			// Step z
		} else if (nextZDist < nextXDist && nextZDist < nextYDist) {
			this.currZ = nextZDist;
			this.currentBlock = this.currentBlock.add(new Vector3(0, 0, this.zDir));
		}

		const blockCenter = BlockUtil.FloorPos(this.currentBlock).add(new Vector3(0.5, 0.5, 0.5));
		const blockCenterFromOrigin = blockCenter.sub(this.center);
		const offsetVec = blockCenterFromOrigin.sub(
			this.normalizedDir.mul(blockCenterFromOrigin.Dot(this.normalizedDir)),
		);
		this.lastBlockOffsetFromRay = offsetVec.magnitude;
		if (skipBlocksByDistFromRay !== undefined && offsetVec.magnitude > skipBlocksByDistFromRay) {
			this.iterationsWithoutBlock++;
			return this.Next(skipBlocksByDistFromRay);
		}

		this.iterationsWithoutBlock = 0;
		return this.currentBlock.add(this.offsetFromBlock);
	}

	/**
	 * Must be called after a call to Next. Returns the distance from the raycast ray to the center of the block
	 * returned by call to next. This is the closest distance the ray comes to the block center.
	 */
	public GetLastBlockOffsetFromRay() {
		return this.lastBlockOffsetFromRay;
	}
}
