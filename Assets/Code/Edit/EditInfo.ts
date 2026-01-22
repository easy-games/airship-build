import LoadedWorld from "Code/World/LoadedWorld";
import WorldManager from "Code/World/WorldManager";

export interface EditInfo {
	blockPosition: Vector3;
	oldValue: number;
	newValue: number;
}

export class EditAction {
	public worldNetId: number;
	public edits: EditInfo[] = [];

	public WithSingleEdit(world: LoadedWorld, blockPos: Vector3, oldValue: number, newValue: number): EditAction {
		this.worldNetId = world.networkIdentity.netId;
		this.edits.push({
			blockPosition: blockPos,
			oldValue,
			newValue,
		});
		return this;
	}

	public WithGroupEdit(
		world: LoadedWorld,
		blockPositions: Vector3[],
		oldValues: readonly number[],
		newValues: readonly number[],
	): EditAction {
		this.worldNetId = world.networkIdentity.netId;
		for (let i = 0; i < blockPositions.size(); i++) {
			this.edits.push({
				blockPosition: blockPositions[i],
				oldValue: oldValues[i],
				newValue: newValues[i],
			});
		}
		return this;
	}

	public GetLoadedWorld(): LoadedWorld | undefined {
		return WorldManager.Get().GetLoadedWorldFromNetId(this.worldNetId);
	}
}
