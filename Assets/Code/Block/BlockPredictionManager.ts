import WorldManager from "Code/World/WorldManager";
import BlockDataManager from "./BlockDataManager";
import BlockPlacementManager from "./BlockPlacementManager";
import { BlockUtil } from "./BlockUtil";

export enum VoxelUpdatePredictionType {
	DestroyBlock,
	PlaceBlock,
}

interface BasePrediction<T extends VoxelUpdatePredictionType> {
	predictionType: T;
	position: Vector3;
	commandId?: string;
}

interface DestroyBlockPrediction extends BasePrediction<VoxelUpdatePredictionType.DestroyBlock> {
	oldBlockData: number;
}

interface PlaceBlockPrediction extends BasePrediction<VoxelUpdatePredictionType.PlaceBlock> {
	blockId: number;
}

export type VoxelUpdatePrediction = DestroyBlockPrediction | PlaceBlockPrediction;

interface PredictionResponse {
	disconnect: () => void;
	undoPrediction: () => void;
}

export default class BlockPredictionManager extends AirshipSingleton {
	/**
	 * Map from block id to number of outstanding placement predictions of that block.
	 * This is used to stop the client from predicting a block place when out of blocks.
	 */
	private outstandingPlacePredictions = new Map<number, number>();
	private activePredictions = new Map<Vector3, VoxelUpdatePrediction>();

	override Start(): void {}

	override OnDestroy(): void {}

	/** Register a predicted block change  */
	public RegisterPrediction(prediction: VoxelUpdatePrediction): () => void {
		LogBlockPrediction(
			"Register prediction (for later undo) at " + prediction.position + " " + prediction.commandId,
		);

		// Update outstanding place predictions
		const oldPrediction = this.activePredictions.get(prediction.position);
		if (oldPrediction?.predictionType === VoxelUpdatePredictionType.PlaceBlock) {
			this.UpdateOutstandingPrediction(oldPrediction.blockId, -1);
		}
		if (prediction.predictionType === VoxelUpdatePredictionType.PlaceBlock) {
			this.UpdateOutstandingPrediction(prediction.blockId, 1);
		}

		this.activePredictions.set(prediction.position, prediction);
		return () => {
			if (this.activePredictions.get(prediction.position) === prediction) {
				this.UndoPrediction(prediction);
			}
		};
	}

	private UpdateOutstandingPrediction(blockId: number, update: number) {
		this.outstandingPlacePredictions.set(blockId, (this.outstandingPlacePredictions.get(blockId) ?? 0) + update);
	}

	/**
	 * @param predictionCommandId If specified we'll only undo the prediction at this position if it has the same
	 * command id as the one passed in.
	 */
	public UndoPredictionAtPosition(pos: Vector3, predictionCommandId?: string) {
		pos = BlockUtil.FloorPos(pos);
		LogBlockPrediction("Undoing prediction at " + pos + " from cmd " + predictionCommandId);

		const pred = this.activePredictions.get(pos);
		if (!pred) return;
		if (predictionCommandId && predictionCommandId !== pred.commandId) return;

		this.UndoPrediction(pred);
	}

	public GetPredictionAt(pos: Vector3) {
		pos = BlockUtil.FloorPos(pos);
		return this.activePredictions.get(pos);
	}

	private UndoPrediction(prediction: VoxelUpdatePrediction) {
		if (this.activePredictions.get(prediction.position) !== prediction) return;

		switch (prediction.predictionType) {
			case VoxelUpdatePredictionType.DestroyBlock: {
				const oldBlockData = prediction.oldBlockData;
				BlockPlacementManager.Get().WriteVoxelAndContainedVoxels(
					WorldManager.Get().currentLoadedWorld,
					prediction.position,
					oldBlockData,
					true,
				);
				break;
			}
			case VoxelUpdatePredictionType.PlaceBlock: {
				this.UpdateOutstandingPrediction(prediction.blockId, -1);
				WorldManager.Get().currentWorld.WriteVoxelAt(prediction.position, 0, true);
				BlockDataManager.Get().UnregisterBlockData(prediction.position);
				break;
			}
		}
		this.activePredictions.delete(prediction.position);
	}

	/** Clears out active predictions at a position so they will no longer do anything on undo */
	public ClearPrediction(position: Vector3) {
		const oldPrediction = this.activePredictions.get(position);
		if (oldPrediction?.predictionType === VoxelUpdatePredictionType.PlaceBlock) {
			this.UpdateOutstandingPrediction(oldPrediction.blockId, -1);
		}

		this.activePredictions.delete(position);
	}

	/** Returns the number of outstanding block place predictions for a block type */
	public GetOutstandingPlacePredictions(blockId: number) {
		return this.outstandingPlacePredictions.get(blockId) ?? 0;
	}
}

export function LogBlockPrediction(msg: string) {
	// print(msg);
}
