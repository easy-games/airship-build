import LoadedWorld from "Code/World/LoadedWorld";
import WorldManager from "Code/World/WorldManager";

export interface EditSelectionDto {
	pos1: Vector3;
	pos2: Vector3;
	worldNetId: number;
}

export class EditSelection {
	constructor(public min: Vector3, public max: Vector3, public loadedWorld: LoadedWorld) {}

	public GetBlockPositions(): Vector3[] {
		const results = new Array<Vector3>();

		for (let x = this.min.x; x <= this.max.x; x++) {
			for (let y = this.min.y; y <= this.max.y; y++) {
				for (let z = this.min.z; z <= this.max.z; z++) {
					results.push(new Vector3(x, y, z).sub(this.loadedWorld.offset));
				}
			}
		}

		return results;
	}

	public static FromDtoYielding(dto: EditSelectionDto): EditSelection {
		const min = Vector3.Min(dto.pos1, dto.pos2);
		const max = Vector3.Max(dto.pos1, dto.pos2);
		const world = WorldManager.Get().WaitForLoadedWorldFromNetId(dto.worldNetId);
		return new EditSelection(min, max, world);
	}
}
